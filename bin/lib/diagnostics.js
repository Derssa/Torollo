'use strict';

const { describeDockerHost } = require('./dockerHost');

const DESKTOP_URL = 'https://www.docker.com/products/docker-desktop/';
const ROOTLESS_URL = 'https://docs.docker.com/engine/security/rootless/';

/**
 * Turns the backend's `checks.docker.reason` into what the user should read:
 * one sentence on what is wrong, then the command or setting that fixes it
 * on their OS. Each entry is `{ title, lines, commands }`; `commands` are
 * rendered on their own line so they can be copied.
 */
function explainDaemonFailure({ reason, platform, dockerHost, error }) {
  const endpoint = describeDockerHost(dockerHost, platform);
  switch (reason) {
    case 'socket_not_found':
      return socketNotFound(platform, endpoint, Boolean(dockerHost));
    case 'permission_denied':
      return permissionDenied(platform, endpoint);
    case 'connection_refused':
      return connectionRefused(platform, endpoint);
    case 'timeout':
      return {
        title: 'Docker is not answering.',
        lines: [
          'A daemon that is still starting can hang for a while. Wait until Docker reports it is running, then run `torollo start` again.',
          `Endpoint probed: ${endpoint}`
        ],
        commands: []
      };
    default:
      return {
        title: 'Docker could not be reached.',
        lines: [
          error ? `Docker answered: ${error}` : 'The daemon returned an unexpected error.',
          `Endpoint probed: ${endpoint}`,
          'Check that `docker info` works in this terminal, then run `torollo start` again.'
        ],
        commands: []
      };
  }
}

function socketNotFound(platform, endpoint, explicitHost) {
  if (platform === 'darwin') {
    return {
      title: `Docker's socket was not found (${endpoint}).`,
      lines: [
        'Start Docker Desktop (or Colima, OrbStack, Rancher Desktop) and wait until it reports it is running.',
        'If it is already running, Torollo looked in the wrong place. Either enable "Allow the default Docker socket to be used" in Docker Desktop (Settings → Advanced), or point Torollo at your provider\'s socket:'
      ],
      commands: ['export DOCKER_HOST=unix://$HOME/.docker/run/docker.sock', `No Docker yet? ${DESKTOP_URL}`]
    };
  }
  if (platform === 'win32') {
    return {
      title: `Docker's named pipe was not found (${endpoint}).`,
      lines: [
        'Start Docker Desktop and wait until it reports it is running.',
        'Under WSL2, run `torollo start` from a distribution that has Docker Desktop\'s WSL integration enabled (Settings → Resources → WSL integration).'
      ],
      commands: [`No Docker yet? ${DESKTOP_URL}`]
    };
  }
  return {
    title: `Docker's socket was not found (${endpoint}).`,
    lines: [
      explicitHost
        ? 'DOCKER_HOST points at a socket that does not exist. Fix the path, or unset it to use the default socket.'
        : 'Is Docker installed and running? Start the daemon with:'
    ],
    commands: explicitHost
      ? []
      : [
        'sudo systemctl start docker',
        'No Docker yet?  curl -fsSL https://get.docker.com | sh',
        'Rootless Docker?  export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock'
      ]
  };
}

function permissionDenied(platform, endpoint) {
  if (platform === 'linux') {
    return {
      title: `Your user is not allowed to open Docker's socket (${endpoint}).`,
      lines: ['Add yourself to the docker group, then log out and back in (or reboot) for it to take effect:'],
      commands: ['sudo usermod -aG docker $USER', `Prefer not to? Rootless Docker: ${ROOTLESS_URL}`]
    };
  }
  return {
    title: `Your user is not allowed to open Docker's socket (${endpoint}).`,
    lines: [
      'Restart Docker Desktop. On macOS, also check "Allow the default Docker socket to be used" in Settings → Advanced, which re-creates the socket with the right permissions.'
    ],
    commands: []
  };
}

function connectionRefused(platform, endpoint) {
  const lines = [`The endpoint exists (${endpoint}) but no daemon is answering on it.`];
  if (platform === 'linux') {
    return { title: 'Docker is not running.', lines: [...lines, 'Start the daemon with:'], commands: ['sudo systemctl start docker'] };
  }
  return {
    title: 'Docker is not running.',
    lines: [...lines, 'Start Docker Desktop and wait until it reports it is running, then run `torollo start` again.'],
    commands: []
  };
}

/**
 * What to say once Docker works but the startup routine could not apply the
 * host networking rules subnets/NAT/security groups depend on. Returns null
 * when there is nothing to warn about.
 */
function explainNetworkSupport(network) {
  if (!network) return null;
  if (network.status === 'unsupported' && network.reason === 'rootless') {
    return {
      title: 'Rootless Docker detected: containers work, but the network engine does not.',
      lines: [
        'Subnets, NAT and cross-subnet security groups need iptables rules on the host, which a rootless daemon cannot apply. Single-network projects and roadmaps that do not split subnets are fine.',
        'For the full network engine, run Torollo against a regular (rootful) Docker daemon.'
      ],
      commands: []
    };
  }
  if (network.status === 'failed') {
    return {
      title: 'The host networking rules could not be applied.',
      lines: [
        'Subnets, NAT and cross-subnet security groups may not work in this session. The backend log has the details.'
      ],
      commands: []
    };
  }
  return null;
}

/** Progress of the image preloading, as one line the CLI prints when it changes. */
function describeImageProgress(images) {
  if (!images || !images.current) return null;
  const { total, ready, current } = images;
  const step = `${Math.min(ready + 1, total)}/${total}`;
  switch (current.action) {
    case 'pulling':
      return `Downloading the ${current.label} image (${step})...`;
    case 'building':
      return `Building the ${current.label} image locally (${step}) — this one takes a few minutes...`;
    default:
      return null;
  }
}

module.exports = { explainDaemonFailure, explainNetworkSupport, describeImageProgress };
