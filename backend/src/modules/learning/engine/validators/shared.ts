import { ContainerInfo } from '../../../../infrastructure/docker/providers/containerProvider';
import { ValidatorOutcome } from '../types';

export type ResolvedContainer = { container: ContainerInfo } | { outcome: ValidatorOutcome };

/**
 * Resolves a canvas node name to its container, checking it is of one of the
 * expected node types and currently running. Never throws: a missing, wrong
 * type or stopped node is a pedagogical fail, not an infrastructure error —
 * callers check `'outcome' in result` and return it as-is on failure.
 */
export function resolveRunningContainer(
  containers: ContainerInfo[],
  node: string,
  expectedTypes: string[],
  expectedLabel: string
): ResolvedContainer {
  const container = containers.find((c) => c.name === node);
  if (!container) {
    return {
      outcome: {
        status: 'fail',
        message:
          `No container named "${node}" exists in this project yet. ` +
          `Create the node on the canvas, name it "${node}" and start it.`,
        expected: `a running ${expectedLabel} node named "${node}"`,
        observed: 'no container with that name',
      },
    };
  }

  const type = container.type ?? 'ubuntu';
  if (!expectedTypes.includes(type)) {
    return {
      outcome: {
        status: 'fail',
        message: `"${node}" is not a ${expectedLabel} node (it's a ${type} node). Point this check at your ${expectedLabel} node.`,
        expected: `a ${expectedLabel} node named "${node}"`,
        observed: `a ${type} node`,
      },
    };
  }

  if (container.state !== 'running') {
    return {
      outcome: {
        status: 'fail',
        message:
          `The container "${node}" exists but is not running (current state: ${container.state}). ` +
          `Start it from the canvas.`,
        expected: 'running',
        observed: container.state,
      },
    };
  }

  return { container };
}

export type ResolvedEndpoints =
  | { sourceContainer: ContainerInfo; targetContainer: ContainerInfo }
  | { outcome: ValidatorOutcome };

/**
 * Resolves a `source`/`target` node-name pair to their containers for
 * connectivity checks (`edge_exists`, `port_denied`). Only existence is
 * checked — connectivity is a property of the security-group configuration,
 * independent of whether the containers currently happen to be running.
 */
export function resolveSourceAndTarget(
  containers: ContainerInfo[],
  source: string,
  target: string
): ResolvedEndpoints {
  const sourceContainer = containers.find((c) => c.name === source);
  const targetContainer = containers.find((c) => c.name === target);

  if (!sourceContainer || !targetContainer) {
    const missing = !sourceContainer ? source : target;
    return {
      outcome: {
        status: 'fail',
        message:
          `No container named "${missing}" exists in this project yet. ` +
          `Create both "${source}" and "${target}" on the canvas first.`,
        expected: `both "${source}" and "${target}" to exist`,
        observed: `"${missing}" does not exist`,
      },
    };
  }

  return { sourceContainer, targetContainer };
}

/**
 * Counts running replica containers belonging to the ASG whose own boundary
 * container has this id — reused by `asg_replicas` and `lb_upstreams` (an
 * ASG upstream target counts its running replicas, not itself).
 */
export function countRunningAsgReplicas(containers: ContainerInfo[], asgContainerId: string): number {
  return containers.filter(
    (c) => c.asgId === asgContainerId && c.isAsgInstance && c.state === 'running'
  ).length;
}
