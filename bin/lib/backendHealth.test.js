'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { fetchHealth, waitForBackend, waitForDocker, waitForStartup, dockerStatus } = require('./backendHealth');

/** A /health stand-in that answers with the next scripted body on every call. */
function scriptedHealth(bodies) {
  let calls = 0;
  const server = http.createServer((req, res) => {
    const body = bodies[Math.min(calls, bodies.length - 1)];
    calls += 1;
    res.writeHead(body.status === 'degraded' ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ port: server.address().port, calls: () => calls, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

function unusedPort() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const OK = { status: 'ok', checks: { docker: { status: 'ok' }, network: { status: 'ok' } }, startup: { status: 'ready', images: { total: 5, ready: 5, current: null }, error: null } };
const DOWN = (reason) => ({ status: 'degraded', checks: { docker: { status: 'unreachable', reason, error: 'x' } }, startup: { status: 'pending' } });

test('fetchHealth returns the body even on a 503', async () => {
  const server = await scriptedHealth([DOWN('connection_refused')]);
  try {
    const body = await fetchHealth(server.port);
    assert.equal(body.checks.docker.reason, 'connection_refused');
  } finally {
    await server.close();
  }
});

test('waitForBackend resolves as soon as the backend answers', async () => {
  const server = await scriptedHealth([OK]);
  try {
    const body = await waitForBackend(server.port, { timeoutMs: 2000, intervalMs: 10 });
    assert.equal(body.status, 'ok');
  } finally {
    await server.close();
  }
});

test('waitForBackend gives up after the timeout when nothing listens', async () => {
  const port = await unusedPort();
  await assert.rejects(
    waitForBackend(port, { timeoutMs: 200, intervalMs: 20 }),
    (err) => err.code === 'backend_unreachable' && /did not answer/.test(err.message)
  );
});

test('waitForBackend stops at once when the backend process is gone', async () => {
  const port = await unusedPort();
  const started = Date.now();
  await assert.rejects(
    waitForBackend(port, { timeoutMs: 5000, intervalMs: 20, isAlive: () => false }),
    (err) => err.code === 'backend_unreachable' && /exited/.test(err.message)
  );
  assert.ok(Date.now() - started < 1000);
});

test('waitForDocker returns immediately when Docker is fine', async () => {
  const server = await scriptedHealth([OK]);
  try {
    const body = await waitForDocker(server.port, OK, { graceMs: 1000, intervalMs: 10 });
    assert.equal(body.checks.docker.status, 'ok');
    assert.equal(server.calls(), 0);
  } finally {
    await server.close();
  }
});

test('waitForDocker keeps probing during the grace period and picks up a daemon that just started', async () => {
  const server = await scriptedHealth([DOWN('connection_refused'), DOWN('connection_refused'), OK]);
  const waitedFor = [];
  try {
    const body = await waitForDocker(server.port, DOWN('connection_refused'), {
      graceMs: 2000,
      intervalMs: 10,
      onWaiting: (reason) => waitedFor.push(reason)
    });
    assert.equal(body.checks.docker.status, 'ok');
    assert.deepEqual(waitedFor, ['connection_refused']);
  } finally {
    await server.close();
  }
});

test('waitForDocker hands back the last verdict when the grace period runs out', async () => {
  const server = await scriptedHealth([DOWN('socket_not_found')]);
  try {
    const body = await waitForDocker(server.port, DOWN('socket_not_found'), { graceMs: 100, intervalMs: 10 });
    assert.equal(body.checks.docker.reason, 'socket_not_found');
  } finally {
    await server.close();
  }
});

test('waitForDocker does not wait on a permission problem', async () => {
  const server = await scriptedHealth([OK]);
  try {
    const body = await waitForDocker(server.port, DOWN('permission_denied'), { graceMs: 5000, intervalMs: 10 });
    assert.equal(body.checks.docker.reason, 'permission_denied');
    assert.equal(server.calls(), 0);
  } finally {
    await server.close();
  }
});

test('waitForStartup reports every poll and stops on ready', async () => {
  const running = (label, ready) => ({
    ...OK,
    startup: { status: 'running', images: { total: 5, ready, current: { label, action: 'pulling' } }, error: null }
  });
  const server = await scriptedHealth([running('Ubuntu', 0), running('Redis', 1), OK]);
  const seen = [];
  try {
    const body = await waitForStartup(server.port, { intervalMs: 10, onProgress: (startup) => seen.push(startup.status) });
    assert.deepEqual(seen, ['running', 'running', 'ready']);
    assert.equal(body.startup.status, 'ready');
  } finally {
    await server.close();
  }
});

test('waitForStartup stops on failed and keeps the error', async () => {
  const failed = { ...OK, startup: { status: 'failed', images: { total: 5, ready: 2, current: null }, error: 'pull access denied' } };
  const server = await scriptedHealth([failed]);
  try {
    const body = await waitForStartup(server.port, { intervalMs: 10 });
    assert.equal(body.startup.error, 'pull access denied');
  } finally {
    await server.close();
  }
});

test('waitForStartup treats a backend without startup info as ready', async () => {
  const server = await scriptedHealth([{ status: 'ok', checks: { docker: { status: 'ok' } } }]);
  try {
    const body = await waitForStartup(server.port, { intervalMs: 10 });
    assert.equal(body.status, 'ok');
  } finally {
    await server.close();
  }
});

test('dockerStatus is defensive about malformed bodies', () => {
  assert.deepEqual(dockerStatus(null), { status: 'unreachable', reason: 'unknown' });
  assert.deepEqual(dockerStatus({ checks: {} }), { status: 'unreachable', reason: 'unknown' });
  assert.deepEqual(dockerStatus(OK), { status: 'ok' });
});
