import { NetworkConfigInput, SecurityGroupRuleInput } from './models/networkPolicy';

/**
 * Shared network fixtures for tests — not a test file itself (no `*.test.ts`
 * suffix). Lives in the network module because the config shape belongs here;
 * the learning validators re-export these (`learning/engine/validators/testSupport`).
 *
 * Fixtures must stay *realistic*: hand-picked configs that only contain the
 * rule under test quietly confirm whatever the code does. Every node sits in a
 * subnet and carries the default security group, exactly like a canvas save.
 */

/**
 * The default security group every node gets when dropped on the canvas —
 * mirror of `createDefaultRules` (frontend `CanvasPage/utils/securityRules.ts`):
 * deny all inbound, allow all outbound.
 */
export function makeDefaultSgRules(): SecurityGroupRuleInput[] {
  return [
    { type: 'inbound', action: 'DENY', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' },
    { type: 'outbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' },
  ];
}

/**
 * A realistic applied network config: every node sits in a subnet and carries
 * the default security group, with the learner's rules prepended — the UI
 * always inserts new rules at the top (highest first-match priority).
 */
export function makeNetworkConfig(
  nodeIds: string[],
  learnerRules: Record<string, SecurityGroupRuleInput[]> = {},
  subnetOf: Record<string, string> = {}
): NetworkConfigInput {
  const nodeSubnetMap: Record<string, string> = {};
  const nodeSecurityGroups: Record<string, SecurityGroupRuleInput[]> = {};
  for (const nodeId of nodeIds) {
    nodeSubnetMap[nodeId] = subnetOf[nodeId] ?? 'subnet-public-1';
    nodeSecurityGroups[nodeId] = [...(learnerRules[nodeId] ?? []), ...makeDefaultSgRules()];
  }
  return { nodeSubnetMap, nodeSecurityGroups };
}

/** Minimal Dockerode `ContainerInfo` shape, as `computeSemanticRules` reads it. */
export interface DockerContainerFixture {
  Id: string;
  State: string;
  Labels: Record<string, string>;
}

export function makeDockerContainer(
  overrides: Partial<DockerContainerFixture> & { Id: string }
): DockerContainerFixture {
  return { State: 'running', Labels: {}, ...overrides };
}
