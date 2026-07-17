import { ContainerInfo } from '../../../../infrastructure/docker/providers/containerProvider';
import { SemanticRule } from '../../../network/models/networkPolicy';
import { ValidatorOutcome } from '../types';

export type ResolvedContainer = { container: ContainerInfo } | { outcome: ValidatorOutcome };

const an = (label: string): string => (/^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`);

/**
 * Resolves a canvas node name to its container, checking it is of one of the
 * expected node types — without requiring it to be running (`asg_replicas`
 * targets the ASG boundary container, which never needs to run itself).
 * Never throws: a missing or wrong-type node is a pedagogical fail, not an
 * infrastructure error — callers check `'outcome' in result` and return it
 * as-is on failure.
 */
export function resolveContainerOfType(
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
          `Create the node on the canvas and name it "${node}".`,
        expected: `${an(expectedLabel)} node named "${node}"`,
        observed: 'no container with that name',
      },
    };
  }

  const type = container.type ?? 'ubuntu';
  if (!expectedTypes.includes(type)) {
    return {
      outcome: {
        status: 'fail',
        message: `"${node}" is not ${an(expectedLabel)} node (it's ${an(type)} node). Point this check at your ${expectedLabel} node.`,
        expected: `${an(expectedLabel)} node named "${node}"`,
        observed: `${an(type)} node`,
      },
    };
  }

  return { container };
}

/**
 * Like `resolveContainerOfType`, but additionally requires the container to
 * be currently running.
 */
export function resolveRunningContainer(
  containers: ContainerInfo[],
  node: string,
  expectedTypes: string[],
  expectedLabel: string
): ResolvedContainer {
  const resolved = resolveContainerOfType(containers, node, expectedTypes, expectedLabel);
  if ('outcome' in resolved) return resolved;

  const { container } = resolved;
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

/**
 * Connectivity semantics shared by `edge_exists` and `port_denied`, mirroring
 * both the frontend Network Simulator and the real iptables enforcement
 * (append-only rules + final zero-trust REJECT): only the destination's
 * inbound rules matter, and the FIRST rule matching the pair and port wins —
 * ALLOW opens the port, DENY (or no match at all) blocks it. Rules with
 * `protocol: 'icmp'` are skipped: these checks are about TCP/UDP ports, and
 * `computeSemanticRules` duplicates every ALL-protocol rule into an icmp
 * twin that must not shadow the port decision.
 */
export function findMatchingInboundRule(
  rules: SemanticRule[],
  sourceId: string,
  targetId: string,
  port: number
): SemanticRule | undefined {
  return rules.find(
    (rule) =>
      rule.direction === 'inbound' &&
      rule.protocol !== 'icmp' &&
      rule.sourceNodeId === sourceId &&
      rule.targetNodeId === targetId &&
      (rule.port === 'ALL' || rule.port === String(port))
  );
}

/**
 * Port-agnostic form of the first-match-wins walk, for `edge_exists` without
 * a `port` param: is there ANY port on which the pair's first matching rule
 * is an ALLOW? An earlier `DENY ALL` shadows everything after it; an earlier
 * DENY on a specific port only shadows later ALLOWs on that exact port.
 */
export function hasEffectiveInboundAllow(
  rules: SemanticRule[],
  sourceId: string,
  targetId: string
): boolean {
  const deniedPorts = new Set<string>();
  for (const rule of rules) {
    if (
      rule.direction !== 'inbound' ||
      rule.protocol === 'icmp' ||
      rule.sourceNodeId !== sourceId ||
      rule.targetNodeId !== targetId
    ) {
      continue;
    }
    if (rule.action === 'ALLOW') {
      if (rule.port === 'ALL' || !deniedPorts.has(rule.port)) return true;
    } else if (rule.port === 'ALL') {
      return false;
    } else {
      deniedPorts.add(rule.port);
    }
  }
  return false;
}
