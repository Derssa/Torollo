'use strict';

const net = require('net');

/** Whether `port` is free on both loopbacks: the frontend server binds to both. */
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => {
        const v6Server = net.createServer();
        v6Server.once('error', () => resolve(false));
        v6Server.once('listening', () => {
          v6Server.close(() => resolve(true));
        });
        v6Server.listen(port, '::1');
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort) {
  let port = startPort;
  while (!(await checkPort(port))) {
    port++;
  }
  return port;
}

/** Resolves once something accepts TCP connections on `port`, or rejects after `timeoutMs`. */
function waitForPort(port, { timeoutMs = 15000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Nothing is listening on port ${port} after ${timeoutMs / 1000}s`));
        } else {
          setTimeout(attempt, intervalMs);
        }
      });
    };
    attempt();
  });
}

module.exports = { checkPort, findAvailablePort, waitForPort };
