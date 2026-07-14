import { describe, it, expect } from 'vitest';
import type { NetworkConfig, Subnet } from '../../../shared/types/network';
import { subnetSize } from './canvasGeometry';
import {
  autoGrowContainers,
  allocateIpForNode,
  assignNodeToSubnet,
  removeNodeFromConfig,
  createSubnet,
} from './networkConfigOps';

function subnet(overrides: Partial<Subnet> & { id: string }): Subnet {
  return {
    name: overrides.id,
    type: 'private',
    cidr: '10.0.1.0/24',
    vpcId: 'root-vpc',
    position: { x: 0, y: 0 },
    width: 680,
    height: 260,
    columns: 2,
    rows: 1,
    routes: [],
    ...overrides,
  };
}

function config(overrides: Partial<NetworkConfig> = {}): NetworkConfig {
  return {
    vpcConfig: { name: 'VPC', cidr: '10.0.0.0/16', dnsEnabled: true, igwEnabled: true, description: '' },
    subnets: [subnet({ id: 'subnet-1' })],
    nodeSubnetMap: {},
    nodeSecurityGroups: {},
    nodeIpMap: {},
    ...overrides,
  };
}

describe('autoGrowContainers', () => {
  it('recomputes subnet dimensions from their grid size', () => {
    const base = config({
      subnets: [subnet({ id: 'subnet-1', columns: 3, rows: 2, width: 1, height: 1 })],
    });

    const grown = autoGrowContainers(base);

    expect(grown.subnets[0]).toMatchObject(subnetSize(3, 2));
    // input untouched
    expect(base.subnets[0].width).toBe(1);
  });

  it('defaults missing grid sizes to 2x1', () => {
    const base = config({
      subnets: [subnet({ id: 'subnet-1', columns: undefined, rows: undefined, width: 1, height: 1 })],
    });

    expect(autoGrowContainers(base).subnets[0]).toMatchObject(subnetSize(2, 1));
  });
});

describe('allocateIpForNode', () => {
  it('allocates .2 in an empty subnet', () => {
    expect(allocateIpForNode('n1', 'subnet-1', config())).toBe('10.0.1.2');
  });

  it('keeps the existing IP when it already matches the subnet prefix', () => {
    const base = config({ nodeIpMap: { n1: '10.0.1.7' }, nodeSubnetMap: { n1: 'subnet-1' } });

    expect(allocateIpForNode('n1', 'subnet-1', base)).toBe('10.0.1.7');
  });

  it('skips suffixes taken by other nodes in the same subnet', () => {
    const base = config({
      nodeSubnetMap: { a: 'subnet-1', b: 'subnet-1' },
      nodeIpMap: { a: '10.0.1.2', b: '10.0.1.3' },
    });

    expect(allocateIpForNode('n1', 'subnet-1', base)).toBe('10.0.1.4');
  });

  it('ignores IPs assigned in other subnets', () => {
    const base = config({
      subnets: [subnet({ id: 'subnet-1' }), subnet({ id: 'subnet-2', cidr: '10.0.2.0/24' })],
      nodeSubnetMap: { other: 'subnet-2' },
      nodeIpMap: { other: '10.0.2.2' },
    });

    expect(allocateIpForNode('n1', 'subnet-1', base)).toBe('10.0.1.2');
  });

  it('returns an empty string for an unknown subnet or malformed CIDR', () => {
    expect(allocateIpForNode('n1', 'missing', config())).toBe('');

    const bad = config({ subnets: [subnet({ id: 'subnet-1', cidr: 'not-a-cidr' })] });
    expect(allocateIpForNode('n1', 'subnet-1', bad)).toBe('');
  });
});

describe('assignNodeToSubnet', () => {
  it('maps the node, seeds default rules and allocates an IP', () => {
    const result = assignNodeToSubnet(config(), 'n1', 'subnet-1');

    expect(result.nodeSubnetMap['n1']).toBe('subnet-1');
    expect(result.nodeIpMap['n1']).toBe('10.0.1.2');
    expect(result.nodeSecurityGroups['n1']).toHaveLength(2);
    expect(result.nodeSecurityGroups['n1'][0]).toMatchObject({ type: 'inbound', action: 'DENY' });
  });

  it('keeps an existing non-empty security group', () => {
    const rules = [{ id: 'r1', type: 'inbound' as const, action: 'ALLOW' as const, protocol: 'TCP' as const, port: '80', source: 'x' }];
    const base = config({ nodeSecurityGroups: { n1: rules } });

    expect(assignNodeToSubnet(base, 'n1', 'subnet-1').nodeSecurityGroups['n1']).toBe(rules);
  });

  it('accumulates IPs when assigning several nodes in sequence', () => {
    let cfg = config();
    cfg = assignNodeToSubnet(cfg, 'a', 'subnet-1');
    cfg = assignNodeToSubnet(cfg, 'b', 'subnet-1');

    expect(cfg.nodeIpMap).toMatchObject({ a: '10.0.1.2', b: '10.0.1.3' });
  });
});

describe('removeNodeFromConfig', () => {
  it('cascades subnet mapping, security group, IP and rules referencing the node', () => {
    const base = config({
      nodeSubnetMap: { victim: 'subnet-1', other: 'subnet-1' },
      nodeIpMap: { victim: '10.0.1.2', other: '10.0.1.3' },
      nodeSecurityGroups: {
        victim: [{ id: 'r1', type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '80', source: 'other' }],
        other: [
          { id: 'r2', type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '80', source: 'victim' },
          { id: 'r3', type: 'inbound', action: 'DENY', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' },
        ],
      },
    });

    const result = removeNodeFromConfig(base, 'victim');

    expect(result.nodeSubnetMap).toEqual({ other: 'subnet-1' });
    expect(result.nodeIpMap).toEqual({ other: '10.0.1.3' });
    expect(result.nodeSecurityGroups['victim']).toBeUndefined();
    expect(result.nodeSecurityGroups['other']).toEqual([
      { id: 'r3', type: 'inbound', action: 'DENY', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' },
    ]);
    // input untouched
    expect(base.nodeSubnetMap['victim']).toBe('subnet-1');
  });
});

describe('createSubnet', () => {
  it('creates a public subnet with local and igw routes derived from the VPC CIDR', () => {
    const created = createSubnet('public', { x: 10, y: 20 }, '172.16.0.0/16', 0);

    expect(created).toMatchObject({
      type: 'public',
      name: 'Public Subnet-1',
      cidr: '172.16.1.0/24',
      vpcId: 'root-vpc',
      position: { x: 10, y: 20 },
      columns: 2,
      rows: 1,
      ...subnetSize(2, 1),
    });
    expect(created.routes).toEqual([
      { destination: '172.16.0.0/16', target: 'local', description: 'Local VPC routing' },
      { destination: '0.0.0.0/0', target: 'igw', description: 'Internet access' },
    ]);
  });

  it('creates a private subnet without the igw route and numbers it from the count', () => {
    const created = createSubnet('private', { x: 0, y: 0 }, '10.0.0.0/16', 2);

    expect(created.name).toBe('Private Subnet-3');
    expect(created.cidr).toBe('10.0.3.0/24');
    expect(created.routes).toEqual([
      { destination: '10.0.0.0/16', target: 'local', description: 'Local VPC routing' },
    ]);
  });
});
