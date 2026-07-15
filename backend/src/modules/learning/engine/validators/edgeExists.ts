import { ValidatorHandler } from '../types';
import { requireStringParam, optionalNumberParam } from '../params';
import { resolveSourceAndTarget } from './shared';

/**
 * `edge_exists` — checks that an allowed connection exists from `source` to
 * `target` (omit `port` to accept any port). Params: `{ source: string,
 * target: string, port?: number }` (docs/roadmap-format.md). Connectivity is
 * about security-group configuration, not container liveness, so — unlike
 * `container_running` — a stopped node still counts as long as it exists.
 */
export const edgeExists: ValidatorHandler = async (params, ctx) => {
  const source = requireStringParam(params, 'source');
  const target = requireStringParam(params, 'target');
  const port = optionalNumberParam(params, 'port');

  const containers = await ctx.getContainers();
  const resolved = resolveSourceAndTarget(containers, source, target);
  if ('outcome' in resolved) return resolved.outcome;

  const rules = await ctx.getSemanticRules();
  const allowed = rules.some(
    (rule) =>
      rule.action === 'ALLOW' &&
      rule.sourceNodeId === resolved.sourceContainer.id &&
      rule.targetNodeId === resolved.targetContainer.id &&
      (port === undefined || rule.port === 'ALL' || rule.port === String(port))
  );

  const portLabel = port === undefined ? '' : ` on port ${port}`;
  if (!allowed) {
    return {
      status: 'fail',
      message: `There is no allowed connection from "${source}" to "${target}"${portLabel} yet. Add a security group rule allowing it.`,
      expected: `an allowed connection from "${source}" to "${target}"${portLabel}`,
      observed: 'no matching rule',
    };
  }

  return { status: 'pass', message: `"${source}" can reach "${target}"${portLabel}.` };
};
