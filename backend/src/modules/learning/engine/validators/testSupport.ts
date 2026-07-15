import { ContainerInfo } from '../../../../infrastructure/docker/providers/containerProvider';
import { SemanticRule } from '../../../network/models/networkPolicy';
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
  semanticRules?: SemanticRule[];
  executePsqlCommand?: ValidatorContext['executePsqlCommand'];
  executeRedisCommand?: ValidatorContext['executeRedisCommand'];
  executeMongoCommand?: ValidatorContext['executeMongoCommand'];
  executeCustomCommand?: ValidatorContext['executeCustomCommand'];
}

export function makeContext(overrides: ContextOverrides = {}): ValidatorContext {
  return {
    projectId: 'project-1',
    getContainers: () => Promise.resolve(overrides.containers ?? []),
    getNetworkConfig: () => Promise.resolve(overrides.networkConfig ?? null),
    getSemanticRules: () => Promise.resolve(overrides.semanticRules ?? []),
    executePsqlCommand: overrides.executePsqlCommand ?? (() => Promise.resolve('')),
    executeRedisCommand: overrides.executeRedisCommand ?? (() => Promise.resolve('')),
    executeMongoCommand: overrides.executeMongoCommand ?? (() => Promise.resolve('')),
    executeCustomCommand: overrides.executeCustomCommand ?? (() => Promise.resolve('')),
  };
}

export function makeSemanticRule(overrides: Partial<SemanticRule>): SemanticRule {
  return {
    sourceNodeId: 'src',
    targetNodeId: 'dst',
    protocol: 'tcp',
    port: 'ALL',
    action: 'ALLOW',
    direction: 'inbound',
    ownerNodeId: 'src',
    ...overrides,
  };
}
