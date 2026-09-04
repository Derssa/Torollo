'use strict';

const { execFileSync } = require('child_process');

/**
 * Which daemon endpoint the backend will use, and where that decision came
 * from. The backend (dockerode) honours DOCKER_HOST and otherwise opens the
 * default socket; it knows nothing about `docker context`, which is how
 * Docker Desktop, Colima, OrbStack and Rancher Desktop point the docker CLI
 * at a per-user socket. Asking the CLI for its active endpoint and handing
 * it down as DOCKER_HOST keeps both sides on the same daemon, so a "Docker
 * is running" verdict here means the backend will reach it too.
 *
 * Returns `{ host, source }` where `source` is `env` (DOCKER_HOST was set),
 * `context` (taken from the docker CLI) or `default` (dockerode's own
 * fallback; `host` is null).
 */
function resolveDockerHost({ env = process.env, readActiveContext = readActiveContextEndpoint } = {}) {
  if (env.DOCKER_HOST) return { host: env.DOCKER_HOST, source: 'env' };
  const endpoint = readActiveContext();
  if (endpoint) return { host: endpoint, source: 'context' };
  return { host: null, source: 'default' };
}

function readActiveContextEndpoint() {
  try {
    const out = execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      encoding: 'utf8'
    });
    return out.trim() || null;
  } catch {
    // No docker CLI, or a CLI that cannot read its contexts: let dockerode
    // fall back to the default socket, exactly as the backend would alone.
    return null;
  }
}

/** Human-readable location of the daemon endpoint, for error messages. */
function describeDockerHost(host, platform) {
  if (host) return host;
  if (platform === 'win32') return '//./pipe/docker_engine';
  if (platform === 'darwin') return '~/.docker/run/docker.sock or /var/run/docker.sock';
  return '/var/run/docker.sock';
}

module.exports = { resolveDockerHost, readActiveContextEndpoint, describeDockerHost };
