import { ValidatorHandler } from '../types';
import { requireStringParam, requireNumberParam } from '../params';
import { findMatchingInboundRule, resolveSourceAndTarget } from './shared';

/**
 * `port_denied` — checks that traffic from `source` to `target` on `port` is
 * blocked. Params: `{ source: string, target: string, port: number }`
 * (docs/roadmap-format.md). Reads the same computed security-group rules as
 * `edge_exists`, first-match-wins (see `findMatchingInboundRule`) — no live
 * connection attempt is made (that would be slow and flaky). The zero-trust
 * baseline only exists once the network config is applied and both nodes sit
 * in subnets: outside of that, containers talk freely on the shared bridge,
 * so the check fails instead of blessing an unenforced topology.
 */
export const portDenied: ValidatorHandler = async (params, ctx) => {
  const source = requireStringParam(params, 'source');
  const target = requireStringParam(params, 'target');
  const port = requireNumberParam(params, 'port');

  const containers = await ctx.getContainers();
  const resolved = resolveSourceAndTarget(containers, source, target);
  if ('outcome' in resolved) return resolved.outcome;

  const config = await ctx.getNetworkConfig();
  if (!config?.nodeSubnetMap || Object.keys(config.nodeSubnetMap).length === 0) {
    return {
      status: 'fail',
      message:
        `Port ${port} is not blocked from "${source}" to "${target}": no network configuration ` +
        `is applied to this project yet, so all containers can talk freely. ` +
        `Create a VPC and place your nodes in subnets first.`,
      expected: `port ${port} blocked from "${source}" to "${target}"`,
      observed: 'no network configuration applied',
    };
  }
  const outsideSubnet = [
    { name: source, id: resolved.sourceContainer.id },
    { name: target, id: resolved.targetContainer.id },
  ].find((node) => !config.nodeSubnetMap?.[node.id]);
  if (outsideSubnet) {
    return {
      status: 'fail',
      message:
        `Port ${port} is not blocked from "${source}" to "${target}": "${outsideSubnet.name}" is not ` +
        `inside a subnet, so no firewall applies to it. Place it in a subnet first.`,
      expected: `port ${port} blocked from "${source}" to "${target}"`,
      observed: `"${outsideSubnet.name}" is outside any subnet`,
    };
  }

  const rules = await ctx.getSemanticRules();
  const matched = findMatchingInboundRule(
    rules,
    resolved.sourceContainer.id,
    resolved.targetContainer.id,
    port
  );
  const openRule = matched?.action === 'ALLOW' ? matched : undefined;

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
