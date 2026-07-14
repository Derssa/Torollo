import { describe, it, expect, vi } from 'vitest';
import type { ContainerData } from '../../../shared/types';
import type { NetworkConfig, SecurityGroupRule, Subnet } from '../../../shared/types/network';
import {
  createDefaultRules,
  buildConnectionRule,
  addConnectionRule,
  parseEdgeId,
  removeEdgeRule,
  removeRulesForConnections,
  buildFirewallEdges,
} from './securityRules';

function container(overrides: Partial<ContainerData> & { id: string; name: string }): ContainerData {
  return { state: 'running', status: 'running', ...overrides };
}

function subnet(overrides: Partial<Subnet> & { id: string }): Subnet {
  return {
    name: overrides.id,
    type: 'private',
    vpcId: 'root-vpc',
    position: { x: 0, y: 0 },
    width: 680,
    height: 260,
    routes: [],
    ...overrides,
  };
}

function config(overrides: Partial<NetworkConfig> = {}): NetworkConfig {
  return {
    vpcConfig: { name: 'VPC', cidr: '10.0.0.0/16', dnsEnabled: true, igwEnabled: true, description: '' },
    subnets: [],
    nodeSubnetMap: {},
    nodeSecurityGroups: {},
    nodeIpMap: {},
    ...overrides,
  };
}

function allowRule(source: string, port: string): SecurityGroupRule {
  return { id: `rule-${source}-${port}`, type: 'inbound', action: 'ALLOW', protocol: 'TCP', port, source };
}

describe('createDefaultRules', () => {
  it('returns deny-all-inbound and allow-all-outbound', () => {
    const rules = createDefaultRules();
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ type: 'inbound', action: 'DENY', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' });
    expect(rules[1]).toMatchObject({ type: 'outbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' });
    expect(rules[0].id).not.toBe(rules[1].id);
  });
});

describe('buildConnectionRule', () => {
  it.each([
    ['postgres', '5432', 'TCP'],
    ['sql', '5432', 'TCP'],
    ['nosql', '27017', 'TCP'],
    ['mysql', '3306', 'TCP'],
    ['redis', '6379', 'TCP'],
    ['ubuntu', 'ALL', 'ALL'],
    ['loadbalancer', 'ALL', 'ALL'],
  ])('gives a %s target port %s and protocol %s', (targetType, port, protocol) => {
    const rule = buildConnectionRule('src-1', targetType);
    expect(rule).toMatchObject({ type: 'inbound', action: 'ALLOW', port, protocol, source: 'src-1' });
  });
});

describe('addConnectionRule', () => {
  it('prepends the connection rule to the target security group', () => {
    const base = config({ nodeSecurityGroups: { 'db-1': createDefaultRules() } });

    const result = addConnectionRule(base, 'web-1', 'db-1', 'postgres');

    expect(result).not.toBeNull();
    expect(result!.port).toBe('5432');
    const rules = result!.config.nodeSecurityGroups['db-1'];
    expect(rules).toHaveLength(3);
    expect(rules[0]).toMatchObject({ type: 'inbound', action: 'ALLOW', port: '5432', source: 'web-1' });
    // Original config untouched
    expect(base.nodeSecurityGroups['db-1']).toHaveLength(2);
  });

  it('returns null when an equivalent rule already exists', () => {
    const base = config({ nodeSecurityGroups: { 'db-1': [allowRule('web-1', '5432')] } });

    expect(addConnectionRule(base, 'web-1', 'db-1', 'postgres')).toBeNull();
  });

  it('creates the group when the target has no rules yet', () => {
    const result = addConnectionRule(config(), 'web-1', 'srv-1', 'ubuntu');

    expect(result!.config.nodeSecurityGroups['srv-1']).toHaveLength(1);
    expect(result!.port).toBe('ALL');
  });
});

describe('parseEdgeId', () => {
  it('parses ids produced by buildFirewallEdges', () => {
    expect(parseEdgeId('edge-abc123-def456-5432')).toEqual({ sourceId: 'abc123', targetId: 'def456', port: '5432' });
    expect(parseEdgeId('edge-a-b-ALL')).toEqual({ sourceId: 'a', targetId: 'b', port: 'ALL' });
  });

  it('returns null for malformed ids', () => {
    expect(parseEdgeId('not-an-edge')).toBeNull();
    expect(parseEdgeId('edge-only')).toBeNull();
    expect(parseEdgeId('')).toBeNull();
  });
});

describe('removeEdgeRule', () => {
  it('removes the inbound ALLOW rule matching source and port', () => {
    const base = config({
      nodeSecurityGroups: { 'db-1': [allowRule('web-1', '5432'), allowRule('web-2', '5432')] },
    });

    const result = removeEdgeRule(base, 'web-1', 'db-1', '5432');

    expect(result!.nodeSecurityGroups['db-1']).toEqual([allowRule('web-2', '5432')]);
  });

  it('also removes a wildcard-source rule on the same port', () => {
    const base = config({
      nodeSecurityGroups: { 'db-1': [allowRule('0.0.0.0/0', '5432')] },
    });

    const result = removeEdgeRule(base, 'web-1', 'db-1', '5432');

    expect(result!.nodeSecurityGroups['db-1']).toEqual([]);
  });

  it('keeps rules on other ports and DENY rules', () => {
    const deny = createDefaultRules()[0];
    const base = config({
      nodeSecurityGroups: { 'db-1': [deny, allowRule('web-1', '80')] },
    });

    const result = removeEdgeRule(base, 'web-1', 'db-1', '5432');

    expect(result!.nodeSecurityGroups['db-1']).toEqual([deny, allowRule('web-1', '80')]);
  });

  it('returns null when the target has no security group', () => {
    expect(removeEdgeRule(config(), 'web-1', 'db-1', '5432')).toBeNull();
  });
});

describe('removeRulesForConnections', () => {
  it('removes matching inbound ALLOW rules on any port', () => {
    const base = config({
      nodeSecurityGroups: { 'db-1': [allowRule('web-1', '5432'), allowRule('web-1', '80'), allowRule('web-2', '80')] },
    });

    const result = removeRulesForConnections(base, [{ source: 'web-1', target: 'db-1' }]);

    expect(result!.nodeSecurityGroups['db-1']).toEqual([allowRule('web-2', '80')]);
  });

  it('returns null when nothing matched', () => {
    const base = config({
      nodeSecurityGroups: { 'db-1': [allowRule('web-2', '80')] },
    });

    expect(removeRulesForConnections(base, [{ source: 'web-1', target: 'db-1' }])).toBeNull();
    expect(removeRulesForConnections(base, [{ source: 'web-1', target: 'unknown' }])).toBeNull();
  });
});

describe('buildFirewallEdges', () => {
  const twoSubnetsSameVpc = [subnet({ id: 'subnet-a' }), subnet({ id: 'subnet-b' })];

  function topology(rules: Record<string, SecurityGroupRule[]>, overrides: Partial<NetworkConfig> = {}) {
    return config({
      subnets: twoSubnetsSameVpc,
      nodeSubnetMap: { 'web-1': 'subnet-a', 'db-1': 'subnet-b' },
      nodeSecurityGroups: rules,
      ...overrides,
    });
  }

  const nodes = [container({ id: 'web-1', name: 'web-1' }), container({ id: 'db-1', name: 'db-1', type: 'postgres' })];

  it('builds an edge for an inbound ALLOW rule matching the source node id', () => {
    const edges = buildFirewallEdges(nodes, topology({ 'db-1': [allowRule('web-1', '5432')] }), vi.fn());

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      id: 'edge-web-1-db-1-5432',
      source: 'web-1',
      target: 'db-1',
      type: 'buttonEdge',
      label: 'Port 5432',
    });
  });

  it('matches wildcard and subnet-id sources', () => {
    expect(buildFirewallEdges(nodes, topology({ 'db-1': [allowRule('0.0.0.0/0', '5432')] }), vi.fn())).toHaveLength(1);
    expect(buildFirewallEdges(nodes, topology({ 'db-1': [allowRule('subnet-a', '5432')] }), vi.fn())).toHaveLength(1);
    expect(buildFirewallEdges(nodes, topology({ 'db-1': [allowRule('subnet-b', '5432')] }), vi.fn())).toHaveLength(0);
  });

  it('ignores DENY and outbound rules', () => {
    const outbound: SecurityGroupRule = { ...allowRule('web-1', '5432'), type: 'outbound' };
    const deny: SecurityGroupRule = { ...allowRule('web-1', '5432'), action: 'DENY' };

    expect(buildFirewallEdges(nodes, topology({ 'db-1': [outbound, deny] }), vi.fn())).toHaveLength(0);
  });

  it('excludes NAT gateways as source and destination', () => {
    const withNat = [...nodes, container({ id: 'nat-1', name: 'nat-1', type: 'nat' })];
    const cfg = topology(
      { 'db-1': [allowRule('0.0.0.0/0', '5432')], 'nat-1': [allowRule('0.0.0.0/0', 'ALL')] },
      { nodeSubnetMap: { 'web-1': 'subnet-a', 'db-1': 'subnet-b', 'nat-1': 'subnet-a' } }
    );

    const edges = buildFirewallEdges(withNat, cfg, vi.fn());

    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('web-1');
  });

  it('skips nodes without a subnet and pairs in different VPCs', () => {
    // db-1 has no subnet assignment
    const noSubnet = topology({ 'db-1': [allowRule('0.0.0.0/0', '5432')] }, { nodeSubnetMap: { 'web-1': 'subnet-a' } });
    expect(buildFirewallEdges(nodes, noSubnet, vi.fn())).toHaveLength(0);

    // source sits in a subnet of another VPC
    const otherVpc = config({
      subnets: [subnet({ id: 'subnet-a', vpcId: 'other-vpc' }), subnet({ id: 'subnet-b' })],
      nodeSubnetMap: { 'web-1': 'subnet-a', 'db-1': 'subnet-b' },
      nodeSecurityGroups: { 'db-1': [allowRule('0.0.0.0/0', '5432')] },
    });
    expect(buildFirewallEdges(nodes, otherVpc, vi.fn())).toHaveLength(0);
  });

  it('dedupes edges when several rules resolve to the same source/target/port', () => {
    const cfg = topology({ 'db-1': [allowRule('0.0.0.0/0', '5432'), allowRule('web-1', '5432')] });

    expect(buildFirewallEdges(nodes, cfg, vi.fn())).toHaveLength(1);
  });

  it('threads the onDelete callback into edge data', () => {
    const onDelete = vi.fn();
    const edges = buildFirewallEdges(nodes, topology({ 'db-1': [allowRule('web-1', '5432')] }), onDelete);

    expect(edges[0].data?.onDelete).toBe(onDelete);
  });
});
