#!/usr/bin/env node
'use strict';

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { log, paint } = require('./lib/output');
const { findAvailablePort, waitForPort } = require('./lib/ports');
const { resolveDockerHost, describeDockerHost } = require('./lib/dockerHost');
const { waitForBackend, waitForDocker, waitForStartup, dockerStatus } = require('./lib/backendHealth');
const { explainDaemonFailure, explainNetworkSupport } = require('./lib/diagnostics');
const { ProgressPrinter } = require('./lib/progress');

const USAGE = 'Usage: torollo start [--no-open]';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'start') {
  start({ openBrowser: !args.includes('--no-open') }).catch((err) => {
    log.error(`Failed to start Torollo: ${err.message}`);
    process.exit(1);
  });
} else if (!command || command === '--help' || command === '-h') {
  console.log(USAGE);
} else {
  console.error(USAGE);
  process.exit(1);
}

function openUrl(url) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${opener} ${url}`);
}

/** Spawns a child with stdout/stderr appended to `logFile`, and tracks whether it is still running. */
function spawnLogged(cmd, cmdArgs, options, logFile) {
  const fd = fs.openSync(logFile, 'w');
  const child = spawn(cmd, cmdArgs, { ...options, stdio: ['ignore', fd, fd] });
  let exited = false;
  child.once('exit', () => {
    exited = true;
    fs.closeSync(fd);
  });
  child.isAlive = () => !exited;
  return child;
}

function printExplanation(explanation, level = 'error') {
  log[level](explanation.title);
  for (const line of explanation.lines) log.detail(line);
  for (const cmd of explanation.commands) log.command(cmd);
}

async function start({ openBrowser }) {
  const backendPath = path.join(__dirname, '../backend');
  const frontendPath = path.join(__dirname, '../frontend');
  const logDir = path.join(os.homedir(), '.torollo', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const backendLog = path.join(logDir, 'backend.log');
  const frontendLog = path.join(logDir, 'frontend.log');

  // Both the CLI's verdict and the backend's probe must target the same
  // daemon: hand the docker CLI's active context down as DOCKER_HOST.
  const dockerHost = resolveDockerHost();
  const backendEnv = { ...process.env };
  if (dockerHost.source === 'context') backendEnv.DOCKER_HOST = dockerHost.host;
  const endpointNote = dockerHost.source === 'default' ? 'default socket' : `from ${dockerHost.source === 'env' ? 'DOCKER_HOST' : 'docker context'}`;
  log.info(`Docker endpoint: ${describeDockerHost(dockerHost.host, process.platform)} (${endpointNote})`);

  const frontendPort = await findAvailablePort(23232);
  const backendPort = await findAvailablePort(frontendPort + 1);
  writeFrontendEnv(frontendPath, backendPort);

  const backend = spawnLogged('node', [path.join(backendPath, 'dist/server.js')], {
    env: { ...backendEnv, PORT: String(backendPort) }
  }, backendLog);
  const servePath = require.resolve('serve/build/main.js');
  const frontend = spawnLogged('node', [servePath, '-s', 'dist', '-l', String(frontendPort)], {
    cwd: frontendPath
  }, frontendLog);

  let shuttingDown = false;
  const shutdown = (exitCode) => {
    shuttingDown = true;
    for (const child of [backend, frontend]) {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }
    process.exit(exitCode);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  const fail = (explanation) => {
    printExplanation(explanation);
    log.detail(`Backend log: ${backendLog}`);
    shutdown(1);
  };

  log.info('Starting the Torollo backend...');
  let body;
  try {
    body = await waitForBackend(backendPort, { isAlive: backend.isAlive });
  } catch (err) {
    return fail({ title: 'The Torollo backend did not start.', lines: [err.message], commands: [] });
  }

  body = await waitForDocker(backendPort, body, {
    isAlive: backend.isAlive,
    onWaiting: (reason) => log.info(`Docker is not reachable yet (${reason}). Waiting a few seconds in case it is still starting...`)
  });
  const docker = dockerStatus(body);
  if (docker.status !== 'ok') {
    return fail(explainDaemonFailure({
      reason: docker.reason,
      platform: process.platform,
      dockerHost: dockerHost.host,
      error: docker.error
    }));
  }
  log.ok(`Docker is running${docker.rootless ? ' (rootless)' : ''}.`);

  const progress = new ProgressPrinter({ log });
  try {
    body = await waitForStartup(backendPort, {
      isAlive: backend.isAlive,
      onProgress: (startup) => progress.update(startup)
    });
  } catch (err) {
    return fail({ title: 'The Torollo backend stopped during startup.', lines: [err.message], commands: [] });
  }

  if (body.startup.status === 'failed') {
    log.warn(`The node images could not all be prepared: ${body.startup.error}`);
    log.detail('Torollo will try again when you create a node that needs a missing image. Check your internet connection if downloads keep failing.');
    log.detail(`Backend log: ${backendLog}`);
  } else if (progress.sawWork) {
    log.ok('Node images are ready.');
  }

  const networkNote = explainNetworkSupport(body.checks.network);
  if (networkNote) printExplanation(networkNote, 'warn');

  try {
    await waitForPort(frontendPort);
  } catch (err) {
    return fail({ title: 'The Torollo frontend did not start.', lines: [err.message, `Frontend log: ${frontendLog}`], commands: [] });
  }

  const url = `http://localhost:${frontendPort}`;
  log.blank();
  console.log(paint('cyan', '================================================'));
  console.log(`${paint('green', paint('bold', '[*] Torollo is ready:'))} ${paint('bold', url)}`);
  console.log(paint('cyan', '================================================'));
  log.detail('Press Ctrl+C to stop.');
  log.blank();

  if (openBrowser) openUrl(url);

  for (const [name, child] of [['backend', backend], ['frontend', frontend]]) {
    child.once('exit', () => {
      if (shuttingDown) return;
      log.error(`The Torollo ${name} stopped unexpectedly (${child.signalCode || `exit code ${child.exitCode}`}).`);
      log.detail(`Log: ${name === 'backend' ? backendLog : frontendLog}`);
      shutdown(1);
    });
  }
}

/** Tells the built frontend which port the backend listens on. */
function writeFrontendEnv(frontendPath, backendPort) {
  const envContent = `window.TOROLLO_BACKEND_PORT = ${backendPort};`;
  for (const dir of ['public', 'dist']) {
    const target = path.join(frontendPath, dir);
    if (fs.existsSync(target)) fs.writeFileSync(path.join(target, 'env.js'), envContent);
  }
}
