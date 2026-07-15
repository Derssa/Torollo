import { ValidatorHandler } from '../types';
import { requireStringParam, requireNumberParam } from '../params';
import { countRunningAsgReplicas } from './shared';

/**
 * `asg_replicas` — checks that an auto-scaling group node runs exactly
 * `count` instances. Params: `{ node: string, count: number }`
 * (docs/roadmap-format.md). Only the replica count matters — the ASG's own
 * boundary container doesn't need to be running itself.
 */
export const asgReplicas: ValidatorHandler = async (params, ctx) => {
  const node = requireStringParam(params, 'node');
  const count = requireNumberParam(params, 'count');

  const containers = await ctx.getContainers();
  const asgContainer = containers.find((c) => c.name === node);
  if (!asgContainer) {
    return {
      status: 'fail',
      message: `No auto-scaling group named "${node}" exists in this project yet. Create it on the canvas first.`,
      expected: `an auto-scaling group named "${node}"`,
      observed: 'no container with that name',
    };
  }

  const runningReplicas = countRunningAsgReplicas(containers, asgContainer.id);

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
