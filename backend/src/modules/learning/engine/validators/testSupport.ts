import { ContainerInfo } from '../../../../infrastructure/docker/providers/containerProvider';
import { NetworkService } from '../../../network/services/networkService';
import { ValidatorContext, ValidatorNetworkConfig } from '../types';

/** Shared test fixtures for validator tests — not a test file itself (no `*.test.ts` suffix). */
export function makeContainer(overrides: Partial<ContainerInfo>): ContainerInfo {
  return {
    id: 'container-1',
    name: 'node',
    image: 'image:latest',
    state: 'running',
    status: 'Up 2 minutes',
    ...overrides,
  };
}

interface ContextOverrides {
  containers?: ContainerInfo[];
  networkConfig?: ValidatorNetworkConfig | null;
  interSubnetStatus?: ReturnType<ValidatorContext['getInterSubnetStatus']>;
  executePsqlCommand?: ValidatorContext['executePsqlCommand'];
  executeRedisCommand?: ValidatorContext['executeRedisCommand'];
  executeMongoCommand?: ValidatorContext['executeMongoCommand'];
  executeCustomCommand?: ValidatorContext['executeCustomCommand'];
}

/**
 * Semantic rules are never injected by hand: they are always derived from the
 * (realistic) network config through the real `computeSemanticRules`, exactly
 * as the engine wires it — hand-built rules once hid real false-pass bugs
 * behind a green suite. Tests exercising this path must mock `DockerClient`
 * (`computeSemanticRules` lists containers to resolve ASG replicas).
 */
export function makeContext(overrides: ContextOverrides = {}): ValidatorContext {
  const config = overrides.networkConfig ?? null;
  return {
    projectId: 'project-1',
    getContainers: () => Promise.resolve(overrides.containers ?? []),
    getNetworkConfig: () => Promise.resolve(config),
    getSemanticRules: () =>
      config ? NetworkService.computeSemanticRules('project-1', config) : Promise.resolve([]),
    getInterSubnetStatus: () => overrides.interSubnetStatus ?? 'unknown',
    executePsqlCommand: overrides.executePsqlCommand ?? (() => Promise.resolve('')),
    executeRedisCommand: overrides.executeRedisCommand ?? (() => Promise.resolve('')),
    executeMongoCommand: overrides.executeMongoCommand ?? (() => Promise.resolve('')),
    executeCustomCommand: overrides.executeCustomCommand ?? (() => Promise.resolve('')),
  };
}

export interface SecurityGroupRuleFixture {
  type: 'inbound' | 'outbound';
  action: 'ALLOW' | 'DENY';
  protocol: string;
  port: string;
  source: string;
}

/**
 * The default security group every node gets when dropped on the canvas —
 * mirror of `createDefaultRules` (frontend `CanvasPage/utils/securityRules.ts`):
 * deny all inbound, allow all outbound.
 */
export function makeDefaultSgRules(): SecurityGroupRuleFixture[] {
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
  learnerRules: Record<string, SecurityGroupRuleFixture[]> = {}
): ValidatorNetworkConfig {
  const nodeSubnetMap: Record<string, string> = {};
  const nodeSecurityGroups: Record<string, SecurityGroupRuleFixture[]> = {};
  for (const nodeId of nodeIds) {
    nodeSubnetMap[nodeId] = 'subnet-public-1';
    nodeSecurityGroups[nodeId] = [...(learnerRules[nodeId] ?? []), ...makeDefaultSgRules()];
  }
  return { nodeSubnetMap, nodeSecurityGroups };
}
