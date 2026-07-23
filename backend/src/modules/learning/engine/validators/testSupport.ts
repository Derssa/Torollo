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

/** Network-config fixtures live with the config shape, in the network module. */
export { makeDefaultSgRules, makeNetworkConfig } from '../../../network/testSupport';
