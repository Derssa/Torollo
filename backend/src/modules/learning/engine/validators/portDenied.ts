import { ValidatorHandler } from '../types';
import { requireStringParam, requireNumberParam } from '../params';
import { resolveSourceAndTarget } from './shared';

/**
 * `port_denied` — checks that traffic from `source` to `target` on `port` is
 * blocked. Params: `{ source: string, target: string, port: number }`
 * (docs/roadmap-format.md). Reads the same computed security-group rules as
 * `edge_exists`: the port is "denied" when no `ALLOW` rule covers it, mirroring
 * the zero-trust default the enforcement planner applies to real containers —
 * no live connection attempt is made (that would be slow and flaky).
 */
export const portDenied: ValidatorHandler = async (params, ctx) => {
  const source = requireStringParam(params, 'source');
  const target = requireStringParam(params, 'target');
  const port = requireNumberParam(params, 'port');

  const containers = await ctx.getContainers();
  const resolved = resolveSourceAndTarget(containers, source, target);
  if ('outcome' in resolved) return resolved.outcome;

  const rules = await ctx.getSemanticRules();
  const openRule = rules.find(
    (rule) =>
      rule.action === 'ALLOW' &&
      rule.sourceNodeId === resolved.sourceContainer.id &&
      rule.targetNodeId === resolved.targetContainer.id &&
      (rule.port === 'ALL' || rule.port === String(port))
  );

  if (openRule) {
    return {
      status: 'fail',
      message: `Port ${port} is still open from "${source}" to "${target}". Add or tighten a security group rule to block it.`,
      expected: `port ${port} blocked from "${source}" to "${target}"`,
      observed:
        openRule.port === 'ALL'
          ? `all ports are allowed from "${source}" to "${target}"`
          : `port ${port} is explicitly allowed from "${source}" to "${target}"`,
    };
  }

  return { status: 'pass', message: `Port ${port} is blocked from "${source}" to "${target}".` };
};
