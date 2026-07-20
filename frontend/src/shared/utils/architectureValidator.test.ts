import { describe, it, expect } from 'vitest';
import { validateArchitecture } from './architectureValidator';
import type { NetworkConfig } from './architectureValidator';
import type { ContainerData } from '../types';

function container(overrides: Partial<ContainerData> & { id: string; name: string }): ContainerData {
  return { state: 'running', status: 'running', ...overrides };
}

function baseConfig(overrides: Partial<NetworkConfig> = {}): NetworkConfig {
  return {
    subnets: [],
    nodeSubnetMap: {},
    nodeSecurityGroups: {},
    ...overrides,
  };
}

describe('validateArchitecture', () => {
  it('errors when a node maps to a subnet id that does not exist', () => {
    const node = container({ id: 'n1', name: 'App Server' });
    const config = baseConfig({ nodeSubnetMap: { n1: 'subnet-missing' } });

    const result = validateArchitecture(config, [node]);

    expect(result.errors).toContainEqual({ key: 'nodeMissingSubnet', params: { name: 'App Server' } });
  });

  it('does not error when a node maps to a vpc- prefixed id (not a subnet)', () => {
    const node = container({ id: 'n1', name: 'App Server' });
    const config = baseConfig({ nodeSubnetMap: { n1: 'vpc-1' } });

    const result = validateArchitecture(config, [node]);

    expect(result.errors).toEqual([]);
  });

  it('warns when a data store sits in a public subnet', () => {
    const db = container({ id: 'db1', name: 'Primary DB', type: 'postgres' });
    const config = baseConfig({
      subnets: [{ id: 'sub-pub', name: 'Public', type: 'public', vpcId: null, position: { x: 0, y: 0 }, width: 1, height: 1, routes: [] }],
      nodeSubnetMap: { db1: 'sub-pub' },
    });

    const result = validateArchitecture(config, [db]);

    expect(result.warnings).toContainEqual({ key: 'dataStorePublicSubnet', params: { name: 'Primary DB' } });
  });

  it('does not warn about public subnet placement for non-sensitive node types', () => {
    const app = container({ id: 'app1', name: 'App', type: 'ubuntu' });
    const config = baseConfig({
      subnets: [{ id: 'sub-pub', name: 'Public', type: 'public', vpcId: null, position: { x: 0, y: 0 }, width: 1, height: 1, routes: [] }],
      nodeSubnetMap: { app1: 'sub-pub' },
    });

    const result = validateArchitecture(config, [app]);

    expect(result.warnings).toEqual([]);
  });

  it('warns when a data store security group allows inbound from 0.0.0.0/0', () => {
    const db = container({ id: 'db1', name: 'Cache', type: 'redis' });
    const config = baseConfig({
      nodeSecurityGroups: {
        db1: [{ id: 'r1', type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '6379', source: '0.0.0.0/0' }],
      },
    });

    const result = validateArchitecture(config, [db]);

    expect(result.warnings).toContainEqual({ key: 'dataStorePublicExposure', params: { name: 'Cache' } });
  });

  it('does not warn about public exposure when the matching rule is outbound', () => {
    const db = container({ id: 'db1', name: 'Cache', type: 'redis' });
    const config = baseConfig({
      nodeSecurityGroups: {
        db1: [{ id: 'r1', type: 'outbound', action: 'ALLOW', protocol: 'TCP', port: '6379', source: '0.0.0.0/0' }],
      },
    });

    const result = validateArchitecture(config, [db]);

    expect(result.warnings).toEqual([]);
  });

  it('warns when there is a database but no caching tier', () => {
    const db = container({ id: 'db1', name: 'Primary DB', type: 'postgres' });

    const result = validateArchitecture(baseConfig(), [db]);

    expect(result.warnings).toContainEqual({ key: 'noCachingTier' });
  });

  it('does not warn about a missing caching tier when a redis node is present', () => {
    const db = container({ id: 'db1', name: 'Primary DB', type: 'postgres' });
    const cache = container({ id: 'c1', name: 'Cache', type: 'redis' });

    const result = validateArchitecture(baseConfig(), [db, cache]);

    expect(result.warnings).not.toContainEqual({ key: 'noCachingTier' });
  });

  it('does not warn about a missing caching tier when there is no database at all', () => {
    const app = container({ id: 'app1', name: 'App', type: 'ubuntu' });

    const result = validateArchitecture(baseConfig(), [app]);

    expect(result.warnings).toEqual([]);
  });

  it('warns when a database receives a direct connection from a public-facing node', () => {
    const gateway = container({ id: 'gw1', name: 'api-gateway', type: 'ubuntu' });
    const db = container({ id: 'db1', name: 'Primary DB', type: 'postgres' });
    const config = baseConfig({
      nodeSubnetMap: { gw1: 'sub-pub' },
      subnets: [{ id: 'sub-pub', name: 'Public', type: 'public', vpcId: null, position: { x: 0, y: 0 }, width: 1, height: 1, routes: [] }],
      nodeSecurityGroups: {
        db1: [{ id: 'r1', type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'gw1' }],
      },
    });

    const result = validateArchitecture(config, [gateway, db]);

    expect(result.warnings).toContainEqual({
      key: 'directPublicToDb',
      params: { db: 'Primary DB', src: 'api-gateway' },
    });
  });

  it('reports a secure 3-tier success when frontend -> backend -> db flow is properly isolated', () => {
    const frontend = container({ id: 'fe1', name: 'gateway', type: 'ubuntu' });
    const backend = container({ id: 'be1', name: 'app-server', type: 'ubuntu' });
    const db = container({ id: 'db1', name: 'Primary DB', type: 'postgres' });
    const config = baseConfig({
      subnets: [
        { id: 'sub-pub', name: 'Public', type: 'public', vpcId: null, position: { x: 0, y: 0 }, width: 1, height: 1, routes: [] },
        { id: 'sub-priv', name: 'Private', type: 'private', vpcId: null, position: { x: 0, y: 0 }, width: 1, height: 1, routes: [] },
      ],
      nodeSubnetMap: { fe1: 'sub-pub', be1: 'sub-priv', db1: 'sub-priv' },
      nodeSecurityGroups: {
        be1: [{ id: 'r1', type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '80', source: 'fe1' }],
        db1: [{ id: 'r2', type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'be1' }],
      },
    });

    const result = validateArchitecture(config, [frontend, backend, db]);

    expect(result.successes).toContainEqual({ key: 'secure3Tier' });
  });

  it('produces the generic success message when a valid multi-node config has no errors or warnings', () => {
    const a = container({ id: 'a', name: 'node-a', type: 'ubuntu' });
    const b = container({ id: 'b', name: 'node-b', type: 'ubuntu' });

    const result = validateArchitecture(baseConfig(), [a, b]);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.successes).toContainEqual({ key: 'vpcValid' });
  });

  it('produces no successes for an empty container list', () => {
    const result = validateArchitecture(baseConfig(), []);

    expect(result.successes).toEqual([]);
  });
});
