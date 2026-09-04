'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProgressPrinter } = require('./progress');

function harness({ heartbeatMs = 30000 } = {}) {
  const lines = [];
  let clock = 1000;
  const printer = new ProgressPrinter({
    log: { info: (msg) => lines.push(`info: ${msg}`), detail: (msg) => lines.push(`detail: ${msg}`) },
    heartbeatMs,
    now: () => clock
  });
  return { printer, lines, tick: (ms) => { clock += ms; } };
}

const pulling = (label, ready) => ({ images: { total: 5, ready, current: { label, action: 'pulling' } } });
const checking = (label, ready) => ({ images: { total: 5, ready, current: { label, action: 'checking' } } });
const idle = { images: { total: 5, ready: 5, current: null } };

test('stays silent when every image is already local', () => {
  const { printer, lines } = harness();
  printer.update(checking('Ubuntu', 0));
  printer.update(checking('Redis', 3));
  printer.update(idle);
  assert.deepEqual(lines, []);
  assert.equal(printer.sawWork, false);
});

test('announces the first run once, then one line per image transition', () => {
  const { printer, lines } = harness();
  printer.update(pulling('Ubuntu', 0));
  printer.update(pulling('Ubuntu', 0));
  printer.update(pulling('Redis', 1));
  printer.update(idle);
  assert.deepEqual(lines, [
    'info: First run: downloading the node images. This happens once and can take a few minutes.',
    'info: Downloading the Ubuntu image (1/5)...',
    'info: Downloading the Redis image (2/5)...'
  ]);
  assert.equal(printer.sawWork, true);
});

test('prints a heartbeat with the elapsed time while the same image stays in flight', () => {
  const { printer, lines, tick } = harness({ heartbeatMs: 30000 });
  printer.update(pulling('Ubuntu', 0));
  tick(10000);
  printer.update(pulling('Ubuntu', 0));
  tick(25000);
  printer.update(pulling('Ubuntu', 0));
  tick(30000);
  printer.update(pulling('Ubuntu', 0));
  assert.deepEqual(lines.slice(2), [
    'detail: still working (35s elapsed)...',
    'detail: still working (65s elapsed)...'
  ]);
});
