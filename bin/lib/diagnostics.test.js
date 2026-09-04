'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { explainDaemonFailure, explainNetworkSupport, describeImageProgress } = require('./diagnostics');

const REASONS = ['socket_not_found', 'permission_denied', 'connection_refused', 'timeout', 'unknown'];
const PLATFORMS = ['linux', 'darwin', 'win32'];

test('every reason on every platform yields a title and at least one hint', () => {
  for (const platform of PLATFORMS) {
    for (const reason of REASONS) {
      const explanation = explainDaemonFailure({ reason, platform, dockerHost: null });
      assert.ok(explanation.title.length > 0, `${reason}/${platform} has a title`);
      assert.ok(explanation.lines.length + explanation.commands.length > 0, `${reason}/${platform} has a hint`);
    }
  }
});

test('the three first-run failures read differently from each other', () => {
  const titles = ['socket_not_found', 'permission_denied', 'connection_refused']
    .map((reason) => explainDaemonFailure({ reason, platform: 'linux', dockerHost: null }).title);
  assert.equal(new Set(titles).size, 3);
});

test('permission denied on Linux hands out the usermod command', () => {
  const explanation = explainDaemonFailure({ reason: 'permission_denied', platform: 'linux', dockerHost: null });
  assert.ok(explanation.commands.some((cmd) => cmd.includes('sudo usermod -aG docker $USER')));
  assert.match(explanation.lines.join(' '), /log out/);
});

test('a missing socket on macOS points at the Docker Desktop socket setting', () => {
  const explanation = explainDaemonFailure({ reason: 'socket_not_found', platform: 'darwin', dockerHost: null });
  assert.match(explanation.lines.join(' '), /Allow the default Docker socket to be used/);
  assert.ok(explanation.commands.some((cmd) => cmd.includes('DOCKER_HOST=unix://')));
});

test('a missing socket on Linux with an explicit DOCKER_HOST blames the path, not the install', () => {
  const explanation = explainDaemonFailure({ reason: 'socket_not_found', platform: 'linux', dockerHost: 'unix:///tmp/nope.sock' });
  assert.match(explanation.title, /\/tmp\/nope\.sock/);
  assert.match(explanation.lines[0], /DOCKER_HOST/);
  assert.deepEqual(explanation.commands, []);
});

test('a missing socket on Linux without DOCKER_HOST offers to start or install the daemon', () => {
  const explanation = explainDaemonFailure({ reason: 'socket_not_found', platform: 'linux', dockerHost: null });
  assert.ok(explanation.commands.some((cmd) => cmd.includes('systemctl start docker')));
  assert.ok(explanation.commands.some((cmd) => cmd.includes('get.docker.com')));
});

test('connection refused on Linux tells how to start the daemon', () => {
  const explanation = explainDaemonFailure({ reason: 'connection_refused', platform: 'linux', dockerHost: null });
  assert.match(explanation.title, /not running/);
  assert.deepEqual(explanation.commands, ['sudo systemctl start docker']);
});

test('the unknown reason surfaces the raw error for a human', () => {
  const explanation = explainDaemonFailure({ reason: 'unknown', platform: 'linux', dockerHost: null, error: 'boom' });
  assert.ok(explanation.lines.some((line) => line.includes('boom')));
});

test('network support: rootless is a warning with the scope of what breaks', () => {
  const note = explainNetworkSupport({ status: 'unsupported', reason: 'rootless' });
  assert.match(note.title, /Rootless Docker/);
  assert.match(note.lines.join(' '), /Subnets, NAT and cross-subnet security groups/);
});

test('network support: nothing to say when the rules were applied or not attempted yet', () => {
  assert.equal(explainNetworkSupport({ status: 'ok' }), null);
  assert.equal(explainNetworkSupport({ status: 'pending' }), null);
  assert.equal(explainNetworkSupport(undefined), null);
});

test('network support: a failed attempt is reported', () => {
  assert.match(explainNetworkSupport({ status: 'failed' }).title, /could not be applied/);
});

test('image progress describes pulls and builds with their position', () => {
  assert.equal(
    describeImageProgress({ total: 5, ready: 1, current: { label: 'Redis', action: 'pulling' } }),
    'Downloading the Redis image (2/5)...'
  );
  assert.match(
    describeImageProgress({ total: 5, ready: 4, current: { label: 'RabbitMQ', action: 'building' } }),
    /^Building the RabbitMQ image locally \(5\/5\)/
  );
});

test('image progress stays quiet for cache checks and when idle', () => {
  assert.equal(describeImageProgress({ total: 5, ready: 0, current: { label: 'Ubuntu', action: 'checking' } }), null);
  assert.equal(describeImageProgress({ total: 5, ready: 5, current: null }), null);
  assert.equal(describeImageProgress(undefined), null);
});
