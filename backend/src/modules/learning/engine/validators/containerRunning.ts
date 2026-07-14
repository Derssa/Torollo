import { ValidatorHandler } from '../types';
import { requireStringParam } from '../params';

/**
 * `container_running` — checks that the container behind a canvas node is
 * running. Params: `{ node: string }` where `node` is the canvas node name
 * (the targeting convention of the roadmap format, docs/roadmap-format.md).
 */
export const containerRunning: ValidatorHandler = async (params, ctx) => {
  const node = requireStringParam(params, 'node');
  const containers = await ctx.getContainers();
  const container = containers.find(c => c.name === node);

  if (!container) {
    return {
      status: 'fail',
      message:
        `No container named "${node}" exists in this project yet. ` +
        `Create the node on the canvas, name it "${node}" and start it.`,
      expected: `a running container named "${node}"`,
      observed: 'no container with that name',
    };
  }

  if (container.state !== 'running') {
    return {
      status: 'fail',
      message:
        `The container "${node}" exists but is not running (current state: ${container.state}). ` +
        `Start it from the canvas.`,
      expected: 'running',
      observed: container.state,
    };
  }

  return { status: 'pass', message: `The container "${node}" is running.` };
};
