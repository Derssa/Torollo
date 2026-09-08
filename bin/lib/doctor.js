'use strict';

const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const Docker = require('dockerode');
const packageInfo = require('../../package.json');
const { checkPort } = require('./ports');
const { resolveDockerHost, describeDockerHost } = require('./dockerHost');
const { explainDaemonFailure } = require('./diagnostics');

const execFileAsync = promisify(execFile);
const DEFAULT_PORTS = [23232, 23233];
const MINIMUM_DISK_BYTES = 2 * 1024 * 1024 * 1024;
const DAEMON_TIMEOUT_MS = 10_000;

async function runDoctor({
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  release = os.release(),
  nodeVersion = process.version,
  appPackage = packageInfo,
  homeDir = os.homedir(),
  now = () => new Date(),
  execFileImpl = execFileAsync,
  checkPortImpl = checkPort,
  diskSpaceImpl = readAvailableDiskSpace,
  resolveDockerHostImpl = resolveDockerHost,
  daemonProbeImpl = probeDockerDaemon
} = {}) {
  const dockerHost = resolveDockerHostImpl({ env });
  const checks = await Promise.all([
    checkNode(nodeVersion, appPackage.engines && appPackage.engines.node),
    checkDockerClient(execFileImpl, homeDir),
    checkDaemon({ dockerHost, daemonProbeImpl, platform, homeDir }),
    checkPorts(checkPortImpl),
    checkDisk({ diskSpaceImpl, homeDir }),
    checkTorolloVersion(appPackage.version)
  ]);

  return {
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    ok: checks.every((check) => check.status !== 'fail'),
    system: { platform, arch, release },
    checks
  };
}

function checkNode(version, requirement = '>=18') {
  const current = parseVersion(version);
  const minimum = parseVersion(requirement);
  const valid = current && minimum && compareVersions(current, minimum) >= 0;
  return {
    id: 'node',
    label: 'Node',
    status: valid ? 'pass' : 'fail',
    summary: valid
      ? `${version} (requires ${requirement})`
      : `${version || 'unknown'} does not satisfy ${requirement}`,
    details: { version, requirement },
    ...(!valid && { hints: ['Install a supported Node.js release from https://nodejs.org/.'] })
  };
}

async function checkDockerClient(execFileImpl, homeDir) {
  try {
    const { stdout } = await execFileImpl('docker', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    });
    const output = stdout.trim();
    const match = output.match(/Docker version\s+([^,\s]+)/i);
    return {
      id: 'docker',
      label: 'Docker',
      status: 'pass',
      summary: match ? match[1] : output,
      details: { version: match ? match[1] : null, output }
    };
  } catch (err) {
    const missing = err && err.code === 'ENOENT';
    return {
      id: 'docker',
      label: 'Docker',
      status: 'fail',
      summary: missing ? 'Docker CLI was not found' : 'Docker CLI could not run',
      details: {
        reason: missing ? 'not_found' : 'command_failed',
        error: sanitizeError(err, homeDir)
      },
      hints: [
        missing
          ? 'Install Docker Desktop or Docker Engine: https://docs.docker.com/get-docker/'
          : 'Check that `docker --version` works in this terminal.'
      ]
    };
  }
}

async function checkDaemon({ dockerHost, daemonProbeImpl, platform, homeDir }) {
  const endpoint = sanitizeText(describeDockerHost(dockerHost.host, platform), homeDir);
  try {
    const version = await daemonProbeImpl(dockerHost);
    const serverVersion = version.Version || version.version || 'reachable';
    return {
      id: 'daemon',
      label: 'Daemon reachable',
      status: 'pass',
      summary: serverVersion === 'reachable' ? endpoint : `${serverVersion} via ${endpoint}`,
      details: {
        endpoint,
        source: dockerHost.source,
        serverVersion: version.Version || null,
        apiVersion: version.ApiVersion || null,
        os: version.Os || null,
        arch: version.Arch || null
      }
    };
  } catch (err) {
    const reason = classifyDaemonFailure(err);
    const rawError = sanitizeError(err, homeDir);
    const explanation = explainDaemonFailure({
      reason,
      platform,
      dockerHost: dockerHost.host ? endpoint : null,
      error: rawError
    });
    return {
      id: 'daemon',
      label: 'Daemon reachable',
      status: 'fail',
      summary: explanation.title,
      details: { endpoint, source: dockerHost.source, reason, error: rawError },
      hints: [...explanation.lines, ...explanation.commands]
        .map((hint) => sanitizeText(hint, homeDir))
    };
  }
}

async function checkPorts(checkPortImpl) {
  const availability = await Promise.all(DEFAULT_PORTS.map(async (port) => ({
    port,
    available: await checkPortImpl(port)
  })));
  const occupied = availability.filter((entry) => !entry.available).map((entry) => entry.port);
  return {
    id: 'ports',
    label: 'Ports',
    status: occupied.length === 0 ? 'pass' : 'warn',
    summary: occupied.length === 0
      ? `${DEFAULT_PORTS.join(' and ')} are available`
      : `${occupied.join(' and ')} ${occupied.length === 1 ? 'is' : 'are'} unavailable`,
    details: { ports: availability },
    ...(occupied.length > 0 && {
      hints: ['If another process owns them, Torollo will automatically choose the next available ports.']
    })
  };
}

async function checkDisk({ diskSpaceImpl, homeDir }) {
  try {
    const freeBytes = await diskSpaceImpl(homeDir);
    const enough = freeBytes >= MINIMUM_DISK_BYTES;
    return {
      id: 'disk',
      label: 'Disk',
      status: enough ? 'pass' : 'fail',
      summary: `${formatBytes(freeBytes)} free (minimum ${formatBytes(MINIMUM_DISK_BYTES)})`,
      details: { freeBytes, minimumBytes: MINIMUM_DISK_BYTES },
      ...(!enough && {
        hints: ['Free some disk space before Torollo downloads its Docker images.']
      })
    };
  } catch (err) {
    return {
      id: 'disk',
      label: 'Disk',
      status: 'warn',
      summary: 'Available space could not be measured',
      details: { error: sanitizeError(err, homeDir) },
      hints: ['Check the free space available for your home directory and Docker data.']
    };
  }
}

function checkTorolloVersion(version) {
  const valid = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version || '');
  return {
    id: 'torollo',
    label: 'Torollo version',
    status: valid ? 'pass' : 'fail',
    summary: version || 'unknown',
    details: { version: version || null },
    ...(!valid && { hints: ['Reinstall Torollo with `npm install --global torollo`.'] })
  };
}

async function probeDockerDaemon(dockerHost, timeoutMs = DAEMON_TIMEOUT_MS) {
  const previousHost = process.env.DOCKER_HOST;
  if (dockerHost.source === 'context') process.env.DOCKER_HOST = dockerHost.host;
  let docker;
  try {
    docker = new Docker();
  } finally {
    if (dockerHost.source === 'context') {
      if (previousHost === undefined) delete process.env.DOCKER_HOST;
      else process.env.DOCKER_HOST = previousHost;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await docker.version({ abortSignal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error(`Docker did not answer within ${timeoutMs / 1000}s`), { code: 'ETIMEDOUT' });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function readAvailableDiskSpace(target) {
  if (!fs.promises.statfs) throw new Error('Disk space checks require Node.js 18.15 or newer');
  const stats = await fs.promises.statfs(target);
  return Number(stats.bavail) * Number(stats.bsize);
}

function classifyDaemonFailure(err) {
  switch (err && err.code) {
    case 'ENOENT':
      return 'socket_not_found';
    case 'EACCES':
    case 'EPERM':
      return 'permission_denied';
    case 'ECONNREFUSED':
      return 'connection_refused';
    case 'ETIMEDOUT':
    case 'ESOCKETTIMEDOUT':
    case 'ABORT_ERR':
      return 'timeout';
    default:
      return 'unknown';
  }
}

function formatHumanReport(report) {
  const symbols = { pass: '✓', warn: '!', fail: '✗' };
  const lines = ['Torollo doctor', ''];
  for (const check of report.checks) {
    lines.push(`${check.label.padEnd(18)} ${symbols[check.status]}  ${check.summary}`);
    if (check.status !== 'pass') {
      for (const hint of check.hints || []) lines.push(`    ${hint}`);
    }
  }
  const failed = report.checks.filter((check) => check.status === 'fail').length;
  const warnings = report.checks.filter((check) => check.status === 'warn').length;
  lines.push('');
  if (failed > 0) lines.push(`${failed} ${failed === 1 ? 'check' : 'checks'} failed.`);
  else if (warnings > 0) lines.push(`Checks passed with ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}.`);
  else lines.push('All checks passed.');
  return lines.join('\n');
}

function parseVersion(value) {
  const match = String(value || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)] : null;
}

function compareVersions(left, right) {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

function formatBytes(bytes) {
  const gibibytes = bytes / (1024 * 1024 * 1024);
  return `${gibibytes >= 10 ? gibibytes.toFixed(0) : gibibytes.toFixed(1)} GB`;
}

function sanitizeError(err, homeDir) {
  const value = err && (err.stderr || err.message) ? (err.stderr || err.message) : String(err || 'Unknown error');
  return sanitizeText(String(value).trim().replace(/\s+/g, ' '), homeDir).slice(0, 500);
}

function sanitizeText(value, homeDir) {
  if (!homeDir) return value;
  return String(value).split(homeDir).join('~');
}

module.exports = {
  DEFAULT_PORTS,
  MINIMUM_DISK_BYTES,
  runDoctor,
  formatHumanReport,
  probeDockerDaemon,
  readAvailableDiskSpace,
  classifyDaemonFailure
};
