'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDockerHost, describeDockerHost } = require('./dockerHost');

test('DOCKER_HOST wins over the docker context', () => {
  const result = resolveDockerHost({
    env: { DOCKER_HOST: 'unix:///run/user/1000/docker.sock' },
    readActiveContext: () => 'unix:///Users/me/.docker/run/docker.sock'
  });
  assert.deepEqual(result, { host: 'unix:///run/user/1000/docker.sock', source: 'env' });
});

test('falls back to the active docker context endpoint', () => {
  const result = resolveDockerHost({
    env: {},
    readActiveContext: () => 'unix:///Users/me/.docker/run/docker.sock'
  });
  assert.deepEqual(result, { host: 'unix:///Users/me/.docker/run/docker.sock', source: 'context' });
});

test('leaves the decision to dockerode when no context can be read', () => {
  const result = resolveDockerHost({ env: {}, readActiveContext: () => null });
  assert.deepEqual(result, { host: null, source: 'default' });
});

test('describes the default endpoint per platform', () => {
  assert.equal(describeDockerHost(null, 'linux'), '/var/run/docker.sock');
  assert.equal(describeDockerHost(null, 'win32'), '//./pipe/docker_engine');
  assert.match(describeDockerHost(null, 'darwin'), /\.docker\/run\/docker\.sock/);
  assert.equal(describeDockerHost('tcp://127.0.0.1:2375', 'linux'), 'tcp://127.0.0.1:2375');
});
