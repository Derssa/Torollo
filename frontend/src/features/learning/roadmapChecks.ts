import type { Roadmap, RoadmapValidator } from '../../shared/types/roadmap';

/**
 * Turns a roadmap's first validators into receipt lines describing what the
 * engine will actually check (DESIGN §2: a receipt shows the real thing, never
 * a paraphrase). Used for the "sample validation receipt" a learner sees before
 * playing a roadmap — once they have played it, the panel shows their real run
 * instead.
 *
 * Returns {key, params} descriptors, not text: the same contract as the
 * backend validator messages, so this module stays translation-free.
 */

export interface CheckLine {
  key: string;
  params: Record<string, string | number>;
}

/** Lines beyond this make the block a wall of text rather than a sample. */
const MAX_LINES = 4;

/**
 * One entry per validator type the engine ships. Unknown types (community
 * validators) are skipped rather than rendered with a made-up description.
 */
const LINE_BUILDERS: Record<string, (params: RoadmapValidator['params']) => CheckLine | null> = {
  container_running: p =>
    str(p.node) ? { key: 'learning.detail.check.containerRunning', params: { node: String(p.node) } } : null,
  table_exists: p =>
    str(p.node) && str(p.table)
      ? { key: 'learning.detail.check.tableExists', params: { node: String(p.node), table: String(p.table) } }
      : null,
  redis_key_exists: p =>
    str(p.node) && str(p.key)
      ? { key: 'learning.detail.check.redisKey', params: { node: String(p.node), redisKey: String(p.key) } }
      : null,
  mongo_collection_exists: p =>
    str(p.node) && str(p.collection)
      ? {
          key: 'learning.detail.check.mongoCollection',
          params: { node: String(p.node), collection: String(p.collection) },
        }
      : null,
  edge_exists: p =>
    str(p.source) && str(p.target)
      ? {
          key: num(p.port) ? 'learning.detail.check.edgeAllowedPort' : 'learning.detail.check.edgeAllowed',
          params: { source: String(p.source), target: String(p.target), port: Number(p.port) },
        }
      : null,
  port_denied: p =>
    str(p.source) && str(p.target) && num(p.port)
      ? {
          key: 'learning.detail.check.portDenied',
          params: { source: String(p.source), target: String(p.target), port: Number(p.port) },
        }
      : null,
  lb_upstreams: p =>
    str(p.node) && num(p.min)
      ? { key: 'learning.detail.check.lbUpstreams', params: { node: String(p.node), min: Number(p.min) } }
      : null,
  asg_replicas: p =>
    str(p.node) && num(p.count)
      ? { key: 'learning.detail.check.asgReplicas', params: { node: String(p.node), count: Number(p.count) } }
      : null,
  http_get_contains: p =>
    str(p.node) && str(p.expectedText)
      ? {
          key: 'learning.detail.check.httpContains',
          params: {
            node: String(p.node),
            path: str(p.path) ? String(p.path) : '/',
            expectedText: String(p.expectedText),
          },
        }
      : null,
};

function str(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function num(value: unknown): boolean {
  return typeof value === 'number';
}

/** The first few checks of a roadmap, in play order, as receipt lines. */
export function deriveSampleChecks(roadmap: Roadmap, limit: number = MAX_LINES): CheckLine[] {
  const lines: CheckLine[] = [];
  for (const step of roadmap.steps) {
    for (const validator of step.validators) {
      const line = LINE_BUILDERS[validator.type]?.(validator.params) ?? null;
      // Two steps checking the same thing would print the same line twice.
      if (line && !lines.some(existing => sameLine(existing, line))) {
        lines.push(line);
        if (lines.length === limit) return lines;
      }
    }
  }
  return lines;
}

function sameLine(a: CheckLine, b: CheckLine): boolean {
  return a.key === b.key && JSON.stringify(a.params) === JSON.stringify(b.params);
}
