import { ValidatorHandler } from '../types';
import { requireStringParam, requireNonNegativeIntegerParam } from '../params';
import { countRunningAsgReplicas, resolveContainerOfType } from './shared';

/**
 * `asg_replicas` — checks that an auto-scaling group node runs exactly
 * `count` instances. Params: `{ node: string, count: number }`
 * (docs/roadmap-format.md). Only the replica count matters — the ASG's own
 * boundary container doesn't need to be running itself.
 */
export const asgReplicas: ValidatorHandler = async (params, ctx) => {
  const node = requireStringParam(params, 'node');
  const count = requireNonNegativeIntegerParam(params, 'count');

  const containers = await ctx.getContainers();
  const resolved = resolveContainerOfType(containers, node, ['autoscalinggroup'], 'auto-scaling group');
  if ('outcome' in resolved) return resolved.outcome;

  const runningReplicas = countRunningAsgReplicas(containers, resolved.container.id);

  if (runningReplicas !== count) {
    return {
      status: 'fail',
      message: `The auto-scaling group "${node}" runs ${runningReplicas} replica(s), but this step expects exactly ${count}. Scale it from the canvas.`,
      expected: `exactly ${count} replica(s)`,
      observed: `${runningReplicas} replica(s)`,
    };
  }

  return { status: 'pass', message: `The auto-scaling group "${node}" runs exactly ${count} replica(s).` };
};
