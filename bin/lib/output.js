'use strict';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function paint(color, text) {
  return useColor ? `${colors[color]}${text}${colors.reset}` : text;
}

const log = {
  info: (msg) => console.log(`${paint('cyan', '[i]')} ${msg}`),
  ok: (msg) => console.log(`${paint('green', '[v]')} ${msg}`),
  warn: (msg) => console.log(`${paint('yellow', '[!]')} ${msg}`),
  error: (msg) => console.error(`${paint('red', '[x]')} ${paint('bold', msg)}`),
  /** Indented continuation line under a previous message. */
  detail: (msg) => console.log(`    ${msg}`),
  command: (cmd) => console.log(`      ${paint('bold', cmd)}`),
  blank: () => console.log('')
};

module.exports = { colors, paint, log };
