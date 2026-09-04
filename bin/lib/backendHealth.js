'use strict';

/**
 * Polling helpers around the backend's GET /health, which answers 200 when
 * Docker pings and 503 (with `checks.docker.reason`) when it does not, and
 * always carries `startup` — the image preloading progress.
 *
 * Every function takes `isAlive`: a check that the backend process is still
 * running, so a crashed backend is reported at once instead of after the
 * timeout.
 */

const REQUEST_TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backendUnreachable(message) {
  return Object.assign(new Error(message), { code: 'backend_unreachable' });
}

/** One GET /health, resolved with the parsed body whatever the status code. */
async function fetchHealth(port, { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const res = await fetchImpl(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(timeoutMs) });
  return res.json();
}

/** Resolves with the first /health body once the backend listens. */
async function waitForBackend(port, { timeoutMs = 30000, intervalMs = 500, fetchImpl, isAlive = () => true } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (!isAlive()) throw backendUnreachable('The backend process exited before it started listening.');
    try {
      return await fetchHealth(port, { fetchImpl });
    } catch {
      if (Date.now() >= deadline) {
        throw backendUnreachable(`The backend did not answer on port ${port} within ${timeoutMs / 1000}s.`);
      }
      await sleep(intervalMs);
    }
  }
}

function dockerStatus(body) {
  return body && body.checks && body.checks.docker ? body.checks.docker : { status: 'unreachable', reason: 'unknown' };
}

/**
 * Gives a daemon that is still booting a chance: keeps probing for
 * `graceMs` while Docker is unreachable, unless the reason is one waiting
 * cannot fix. Resolves with the last body either way; the caller decides.
 */
async function waitForDocker(port, body, { graceMs = 20000, intervalMs = 1000, fetchImpl, isAlive = () => true, onWaiting } = {}) {
  let docker = dockerStatus(body);
  if (docker.status === 'ok' || docker.reason === 'permission_denied') return body;
  if (onWaiting) onWaiting(docker.reason);
  const deadline = Date.now() + graceMs;
  let last = body;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    if (!isAlive()) throw backendUnreachable('The backend process exited while waiting for Docker.');
    try {
      last = await fetchHealth(port, { fetchImpl });
    } catch {
      continue;
    }
    docker = dockerStatus(last);
    if (docker.status === 'ok') return last;
  }
  return last;
}

/**
 * Follows the startup routine until it is `ready` or `failed`, calling
 * `onProgress(startup, body)` on every poll so the caller can print what
 * changed. Resolves with the final body.
 */
async function waitForStartup(port, { intervalMs = 1000, fetchImpl, isAlive = () => true, onProgress } = {}) {
  for (;;) {
    if (!isAlive()) throw backendUnreachable('The backend process exited during startup.');
    let body;
    try {
      body = await fetchHealth(port, { fetchImpl });
    } catch {
      await sleep(intervalMs);
      continue;
    }
    const startup = body.startup || { status: 'ready' };
    if (onProgress) onProgress(startup, body);
    if (startup.status === 'ready' || startup.status === 'failed') return body;
    await sleep(intervalMs);
  }
}

module.exports = { fetchHealth, waitForBackend, waitForDocker, waitForStartup, dockerStatus };
