'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MINIMUM_DISK_BYTES,
  runDoctor,
  formatHumanReport,
  classifyDaemonFailure
} = require('./doctor');

const FIXED_DATE = new Date('2026-09-07T12:00:00.000Z');

function healthyDependencies(overrides = {}) {
  return {
    env: {},
    platform: 'linux',
    arch: 'x64',
    release: '6.8.0',
    nodeVersion: 'v20.19.0',
    appPackage: { version: '1.2.4', engines: { node: '>=18' } },
    homeDir: '/home/alice',
    now: () => FIXED_DATE,
    execFileImpl: async () => ({ stdout: 'Docker version 27.5.1, build 1234567\n', stderr: '' }),
    resolveDockerHostImpl: () => ({ host: 'unix:///home/alice/.docker/run/docker.sock', source: 'context' }),
    daemonProbeImpl: async () => ({ Version: '27.5.1', ApiVersion: '1.47', Os: 'linux', Arch: 'amd64' }),
    checkPortImpl: async () => true,
    diskSpaceImpl: async () => 20 * 1024 * 1024 * 1024,
    ...overrides
  };
}

test('healthy report contains the six stable checks in display order', async () => {
  const report = await runDoctor(healthyDependencies());

  assert.equal(report.ok, true);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.generatedAt, FIXED_DATE.toISOString());
  assert.deepEqual(report.checks.map((check) => check.id), [
    'node', 'docker', 'daemon', 'ports', 'disk', 'torollo'
  ]);
  assert.ok(report.checks.every((check) => check.status === 'pass'));
  assert.equal(report.checks[2].details.endpoint, 'unix://~/.docker/run/docker.sock');
});

test('human report renders the requested labels and a success mark', async () => {
  const output = formatHumanReport(await runDoctor(healthyDependencies()));

  for (const label of ['Node', 'Docker', 'Daemon reachable', 'Ports', 'Disk', 'Torollo version']) {
    assert.match(output, new RegExp(`${label}\\s+✓`));
  }
  assert.match(output, /All checks passed\.$/);
});

test('essential failures make the report fail and include actionable hints', async () => {
  const dockerError = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' });
  const daemonError = Object.assign(
    new Error('connect EACCES /home/alice/.docker/run/docker.sock'),
    { code: 'EACCES' }
  );
  const report = await runDoctor(healthyDependencies({
    nodeVersion: 'v16.20.0',
    execFileImpl: async () => { throw dockerError; },
    daemonProbeImpl: async () => { throw daemonError; },
    diskSpaceImpl: async () => MINIMUM_DISK_BYTES - 1
  }));

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.checks.filter((check) => check.status === 'fail').map((check) => check.id),
    ['node', 'docker', 'daemon', 'disk']
  );
  assert.ok(report.checks.filter((check) => check.status === 'fail').every((check) => check.hints.length > 0));
  assert.doesNotMatch(JSON.stringify(report), /\/home\/alice/);
});

test('occupied ports are warnings because start can choose replacements', async () => {
  const report = await runDoctor(healthyDependencies({
    checkPortImpl: async (port) => port !== 23232
  }));

  assert.equal(report.ok, true);
  const ports = report.checks.find((check) => check.id === 'ports');
  assert.equal(ports.status, 'warn');
  assert.match(ports.summary, /23232 is unavailable/);
});

test('a missing default daemon socket offers the Linux startup command', async () => {
  const socketError = Object.assign(new Error('connect ENOENT /var/run/docker.sock'), { code: 'ENOENT' });
  const report = await runDoctor(healthyDependencies({
    resolveDockerHostImpl: () => ({ host: null, source: 'default' }),
    daemonProbeImpl: async () => { throw socketError; }
  }));

  const daemon = report.checks.find((check) => check.id === 'daemon');
  assert.equal(daemon.details.reason, 'socket_not_found');
  assert.ok(daemon.hints.some((hint) => hint.includes('systemctl start docker')));
  assert.ok(daemon.hints.every((hint) => !hint.includes('DOCKER_HOST points')));
});

test('an unavailable disk measurement is a warning, not a false failure', async () => {
  const report = await runDoctor(healthyDependencies({
    diskSpaceImpl: async () => { throw new Error('statfs unavailable'); }
  }));

  assert.equal(report.ok, true);
  assert.equal(report.checks.find((check) => check.id === 'disk').status, 'warn');
});

test('daemon errors map to stable support codes', () => {
  assert.equal(classifyDaemonFailure({ code: 'ENOENT' }), 'socket_not_found');
  assert.equal(classifyDaemonFailure({ code: 'EACCES' }), 'permission_denied');
  assert.equal(classifyDaemonFailure({ code: 'ECONNREFUSED' }), 'connection_refused');
  assert.equal(classifyDaemonFailure({ code: 'ETIMEDOUT' }), 'timeout');
  assert.equal(classifyDaemonFailure(new Error('boom')), 'unknown');
});
