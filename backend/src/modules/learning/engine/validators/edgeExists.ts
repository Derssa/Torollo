import { ValidatorHandler } from '../types';
import { requireStringParam, optionalNumberParam } from '../params';
import { findMatchingInboundRule, hasEffectiveInboundAllow, resolveSourceAndTarget } from './shared';

/**
 * `edge_exists` — checks that an allowed connection exists from `source` to
 * `target` (omit `port` to accept any port). Params: `{ source: string,
 * target: string, port?: number }` (docs/roadmap-format.md). Connectivity is
 * about security-group configuration, not container liveness, so — unlike
 * `container_running` — a stopped node still counts as long as it exists.
 * DENY rules are honored with the same first-match-wins semantics as the
 * Network Simulator and the real enforcement (see `findMatchingInboundRule`).
 *
 * One honesty guard on top of the semantic verdict: when the two nodes live
 * in different subnets and the host failed the real inter-subnet self-test
 * (see `interSubnetHealth`), a correct rule still cannot carry packets — the
 * validator reports that failure explicitly instead of a pass the real
 * network would contradict.
 */
export const edgeExists: ValidatorHandler = async (params, ctx) => {
  const source = requireStringParam(params, 'source');
  const target = requireStringParam(params, 'target');
  const port = optionalNumberParam(params, 'port');

  const containers = await ctx.getContainers();
  const resolved = resolveSourceAndTarget(containers, source, target);
  if ('outcome' in resolved) return resolved.outcome;

  const rules = await ctx.getSemanticRules();
  const sourceId = resolved.sourceContainer.id;
  const targetId = resolved.targetContainer.id;

  const matched = port === undefined ? undefined : findMatchingInboundRule(rules, sourceId, targetId, port);
  const allowed =
    port === undefined
      ? hasEffectiveInboundAllow(rules, sourceId, targetId)
      : matched?.action === 'ALLOW';

  const portLabel = port === undefined ? '' : ` on port ${port}`;
  if (!allowed) {
    const deniedByRule = matched?.action === 'DENY';
    return {
      status: 'fail',
      message: deniedByRule
        ? `The connection from "${source}" to "${target}"${portLabel} is blocked by a DENY rule. Remove it or add an ALLOW rule above it.`
        : `There is no allowed connection from "${source}" to "${target}"${portLabel} yet. Add a security group rule allowing it.`,
      expected: `an allowed connection from "${source}" to "${target}"${portLabel}`,
      observed: deniedByRule ? 'blocked by a DENY rule' : 'no matching rule',
    };
  }

  const config = await ctx.getNetworkConfig();
  const sourceSubnet = config?.nodeSubnetMap?.[sourceId];
  const targetSubnet = config?.nodeSubnetMap?.[targetId];
  const crossSubnet = !!sourceSubnet && !!targetSubnet && sourceSubnet !== targetSubnet;
  if (crossSubnet && ctx.getInterSubnetStatus() === 'blocked') {
    return {
      status: 'fail',
      message:
        `Your rule from "${source}" to "${target}"${portLabel} is configured correctly, ` +
        `but this machine's firewall setup is dropping real traffic between subnets, ` +
        `so the connection cannot actually work here. This is a host limitation, not a mistake in your architecture.`,
      expected: `inter-subnet traffic forwarded by the host`,
      observed: `the host drops routed traffic between subnet networks`,
    };
  }

  return { status: 'pass', message: `"${source}" can reach "${target}"${portLabel}.` };
};
