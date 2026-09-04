'use strict';

const { describeImageProgress } = require('./diagnostics');

/**
 * Prints image preloading progress: one line per image transition plus a
 * heartbeat while a long download or build is in flight, so a first run
 * never looks stuck. `sawWork` tells the caller whether anything had to be
 * downloaded at all.
 */
class ProgressPrinter {
  constructor({ log, heartbeatMs = 30000, now = Date.now }) {
    this.log = log;
    this.heartbeatMs = heartbeatMs;
    this.now = now;
    this.lastLine = null;
    this.lastPrintedAt = 0;
    this.startedAt = 0;
    this.sawWork = false;
  }

  update(startup) {
    const line = describeImageProgress(startup && startup.images);
    if (!line) return;
    if (!this.sawWork) {
      this.sawWork = true;
      this.startedAt = this.now();
      this.log.info('First run: downloading the node images. This happens once and can take a few minutes.');
    }
    if (line !== this.lastLine) {
      this.log.info(line);
      this.lastLine = line;
      this.lastPrintedAt = this.now();
    } else if (this.now() - this.lastPrintedAt >= this.heartbeatMs) {
      this.log.detail(`still working (${Math.round((this.now() - this.startedAt) / 1000)}s elapsed)...`);
      this.lastPrintedAt = this.now();
    }
  }
}

module.exports = { ProgressPrinter };
