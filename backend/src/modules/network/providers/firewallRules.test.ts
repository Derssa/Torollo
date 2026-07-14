import { buildSecurityGroupIntentCommands, buildGatewayAllowCommands } from './firewallRules';
import { NetworkIntent } from '../planner/enforcementPlanner';

const ipMap = { a: '10.0.1.2', b: '10.0.1.3' };

const baseIntent = (overrides: Partial<NetworkIntent> = {}): NetworkIntent => ({
  type: 'ALLOW_CONNECTION',
  sourceNodeId: 'a',
  targetNodeId: 'b',
  protocol: 'all',
  port: 'ALL',
  ownerNodeId: 'b',
  ...overrides
});

describe('buildSecurityGroupIntentCommands', () => {
  it('returns nothing when this node does not own the intent', () => {
    expect(buildSecurityGroupIntentCommands(baseIntent({ ownerNodeId: 'other' }), 'b', 'ubuntu', ipMap)).toEqual([]);
  });

  it('skips inbound rules targeting a NAT Gateway itself', () => {
    const intent = baseIntent({ ownerNodeId: 'b', targetNodeId: 'b' });
    expect(buildSecurityGroupIntentCommands(intent, 'b', 'nat', ipMap)).toEqual([]);
  });

  it('returns nothing when the node is neither source nor target', () => {
    const intent = baseIntent({ sourceNodeId: 'a', targetNodeId: 'c', ownerNodeId: 'x' });
    expect(buildSecurityGroupIntentCommands(intent, 'x', 'ubuntu', ipMap)).toEqual([]);
  });

  it('builds an inbound ACCEPT-all rule when this node is the target', () => {
    const intent = baseIntent();
    const commands = buildSecurityGroupIntentCommands(intent, 'b', 'ubuntu', ipMap);
    expect(commands).toEqual([['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.2', '-j', 'ACCEPT']]);
  });

  it('builds an outbound REJECT-all rule when this node is the source', () => {
    const intent = baseIntent({ type: 'DENY_CONNECTION', ownerNodeId: 'a' });
    const commands = buildSecurityGroupIntentCommands(intent, 'a', 'ubuntu', ipMap);
    expect(commands).toEqual([['iptables', '-A', 'AKAL-OUTPUT', '-d', '10.0.1.3', '-j', 'REJECT']]);
  });

  it('builds both tcp and udp rules for protocol "all" with a specific port', () => {
    const intent = baseIntent({ protocol: 'all', port: '5432' });
    const commands = buildSecurityGroupIntentCommands(intent, 'b', 'ubuntu', ipMap);
    expect(commands).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.2', '-p', 'tcp', '--dport', '5432', '-j', 'ACCEPT'],
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.2', '-p', 'udp', '--dport', '5432', '-j', 'ACCEPT']
    ]);
  });

  it('builds an icmp-only rule', () => {
    const intent = baseIntent({ protocol: 'icmp' });
    const commands = buildSecurityGroupIntentCommands(intent, 'b', 'ubuntu', ipMap);
    expect(commands).toEqual([['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.2', '-p', 'icmp', '-j', 'ACCEPT']]);
  });

  it('builds a specific-protocol, all-ports rule', () => {
    const intent = baseIntent({ protocol: 'tcp', port: 'ALL' });
    const commands = buildSecurityGroupIntentCommands(intent, 'b', 'ubuntu', ipMap);
    expect(commands).toEqual([['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.2', '-p', 'tcp', '-j', 'ACCEPT']]);
  });

  it('builds a specific-protocol, specific-port rule', () => {
    const intent = baseIntent({ protocol: 'tcp', port: '22' });
    const commands = buildSecurityGroupIntentCommands(intent, 'b', 'ubuntu', ipMap);
    expect(commands).toEqual([['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.2', '-p', 'tcp', '--dport', '22', '-j', 'ACCEPT']]);
  });

  it('only builds the inbound rule when this node is solely the target, not the source', () => {
    const intent = baseIntent({ ownerNodeId: 'b', sourceNodeId: 'a', targetNodeId: 'b' });
    const commands = buildSecurityGroupIntentCommands(intent, 'b', 'ubuntu', ipMap);
    expect(commands).toHaveLength(1);
    expect(commands[0][2]).toBe('AKAL-INPUT');
  });

  it('produces nothing when the resolved ip is missing from ipMap', () => {
    const intent = baseIntent({ sourceNodeId: 'missing', targetNodeId: 'b', ownerNodeId: 'b' });
    expect(buildSecurityGroupIntentCommands(intent, 'b', 'ubuntu', ipMap)).toEqual([]);
  });
});

describe('buildGatewayAllowCommands', () => {
  it('returns nothing when there is no gateway IP', () => {
    expect(buildGatewayAllowCommands('', 'all', 'ALL', 'ACCEPT')).toEqual([]);
  });

  it('builds a single ACCEPT-all rule', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'all', 'ALL', 'ACCEPT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-j', 'ACCEPT']
    ]);
  });

  it('builds a tcp-reset + generic REJECT pair for REJECT-all', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'all', 'ALL', 'REJECT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'tcp', '-j', 'REJECT', '--reject-with', 'tcp-reset'],
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-j', 'REJECT']
    ]);
  });

  it('builds an icmp-only rule', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'icmp', 'ALL', 'ACCEPT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'icmp', '-j', 'ACCEPT']
    ]);
  });

  it('builds tcp+udp ACCEPT rules for protocol "all" with a port', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'all', '80', 'ACCEPT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'tcp', '--dport', '80', '-j', 'ACCEPT'],
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'udp', '--dport', '80', '-j', 'ACCEPT']
    ]);
  });

  it('builds tcp-reset + udp REJECT rules for protocol "all" with a port', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'all', '80', 'REJECT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'tcp', '--dport', '80', '-j', 'REJECT', '--reject-with', 'tcp-reset'],
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'udp', '--dport', '80', '-j', 'REJECT']
    ]);
  });

  it('builds a tcp-reset rule for a specific tcp protocol, all ports, REJECT', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'tcp', 'ALL', 'REJECT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'tcp', '-j', 'REJECT', '--reject-with', 'tcp-reset']
    ]);
  });

  it('builds a generic REJECT rule for a non-tcp protocol, all ports', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'udp', 'ALL', 'REJECT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'udp', '-j', 'REJECT']
    ]);
  });

  it('builds a specific-protocol, all-ports ACCEPT rule', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'tcp', 'ALL', 'ACCEPT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'tcp', '-j', 'ACCEPT']
    ]);
  });

  it('builds a tcp-reset rule for a specific tcp protocol and port, REJECT', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'tcp', '443', 'REJECT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'tcp', '--dport', '443', '-j', 'REJECT', '--reject-with', 'tcp-reset']
    ]);
  });

  it('builds a generic REJECT rule for a specific non-tcp protocol and port', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'udp', '443', 'REJECT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'udp', '--dport', '443', '-j', 'REJECT']
    ]);
  });

  it('builds a specific-protocol, specific-port ACCEPT rule', () => {
    expect(buildGatewayAllowCommands('10.0.1.1', 'tcp', '443', 'ACCEPT')).toEqual([
      ['iptables', '-A', 'AKAL-INPUT', '-s', '10.0.1.1', '-p', 'tcp', '--dport', '443', '-j', 'ACCEPT']
    ]);
  });
});
