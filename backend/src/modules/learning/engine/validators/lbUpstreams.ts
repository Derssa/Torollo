import { ValidatorHandler } from '../types';
import { requireStringParam, requireNumberParam } from '../params';
import { resolveRunningContainer, countRunningAsgReplicas } from './shared';

/**
 * `lb_upstreams` — checks that a load balancer node has at least `min`
 * running upstream targets. Params: `{ node: string, min: number }`
 * (docs/roadmap-format.md). Reads the declared targets from the project's
 * network config and counts how many currently resolve to a running
 * container — an ASG target counts its running replicas.
 */
export const lbUpstreams: ValidatorHandler = async (params, ctx) => {
  const node = requireStringParam(params, 'node');
  const min = requireNumberParam(params, 'min');

  const containers = await ctx.getContainers();
  const resolved = resolveRunningContainer(containers, node, ['loadbalancer'], 'load balancer');
  if ('outcome' in resolved) return resolved.outcome;

  const config = await ctx.getNetworkConfig();
  const targetIds = config?.loadBalancerTargets?.[resolved.container.id] ?? [];

  let runningCount = 0;
  for (const targetId of targetIds) {
    if (config?.asgs?.[targetId]) {
      runningCount += countRunningAsgReplicas(containers, targetId);
    } else if (containers.find((c) => c.id === targetId)?.state === 'running') {
      runningCount += 1;
    }
  }

  if (runningCount < min) {
    return {
      status: 'fail',
      message: `The load balancer "${node}" has ${runningCount} running upstream target(s), but needs at least ${min}. Add or start more targets.`,
      expected: `at least ${min} running upstream target(s)`,
      observed: `${runningCount} running upstream target(s)`,
    };
  }

  return {
    status: 'pass',
    message: `The load balancer "${node}" has ${runningCount} running upstream target(s) (at least ${min} required).`,
  };
};
