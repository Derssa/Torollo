import { NetworkIntent } from '../planner/enforcementPlanner';

type IptablesAction = 'ACCEPT' | 'REJECT';

/** Builds the iptables args for one direction (source or destination match) of a rule. */
function buildDirectionalRuleCommands(
  chain: 'AKAL-INPUT' | 'AKAL-OUTPUT',
  flag: '-s' | '-d',
  ip: string,
  rawProto: string,
  port: string,
  action: string
): string[][] {
  if (rawProto === 'all' && port === 'ALL') {
    return [['iptables', '-A', chain, flag, ip, '-j', action]];
  }
  if (rawProto === 'icmp') {
    return [['iptables', '-A', chain, flag, ip, '-p', 'icmp', '-j', action]];
  }
  if (rawProto === 'all') {
    return [
      ['iptables', '-A', chain, flag, ip, '-p', 'tcp', '--dport', port, '-j', action],
      ['iptables', '-A', chain, flag, ip, '-p', 'udp', '--dport', port, '-j', action]
    ];
  }
  if (port === 'ALL') {
    return [['iptables', '-A', chain, flag, ip, '-p', rawProto, '-j', action]];
  }
  return [['iptables', '-A', chain, flag, ip, '-p', rawProto, '--dport', port, '-j', action]];
}

/**
 * Builds the AKAL-INPUT/AKAL-OUTPUT iptables commands enforcing a security-group
 * intent that this node owns, for either direction it participates in.
 */
export function buildSecurityGroupIntentCommands(
  intent: NetworkIntent,
  nodeId: string,
  nodeType: string,
  ipMap: Record<string, string>
): string[][] {
  if (intent.ownerNodeId !== nodeId) return [];
  if (nodeType === 'nat' && intent.targetNodeId === nodeId) {
    // NAT Gateways do not allow direct inbound connections; skip applying rules
    return [];
  }

  const isTarget = intent.targetNodeId === nodeId;
  const isSource = intent.sourceNodeId === nodeId;
  if (!isTarget && !isSource) return [];

  const action = intent.type.startsWith('ALLOW') ? 'ACCEPT' : 'REJECT';
  const rawProto = intent.protocol || 'all';
  const rawPort = intent.port || 'ALL';
  const port = (typeof rawPort === 'string' && rawPort.toUpperCase() === 'ALL') ? 'ALL' : rawPort;

  const commands: string[][] = [];

  const sourceIp = isTarget ? ipMap[intent.sourceNodeId || ''] : undefined;
  if (isTarget && sourceIp) {
    commands.push(...buildDirectionalRuleCommands('AKAL-INPUT', '-s', sourceIp, rawProto, port, action));
  }

  const targetIp = isSource ? ipMap[intent.targetNodeId || ''] : undefined;
  if (isSource && targetIp) {
    commands.push(...buildDirectionalRuleCommands('AKAL-OUTPUT', '-d', targetIp, rawProto, port, action));
  }

  return commands;
}

/**
 * Builds the AKAL-INPUT allow/reject commands for host-to-container traffic
 * arriving from a given gateway IP, when a security group allows inbound from
 * 0.0.0.0/0. Called once per gateway the container may be reachable from
 * (the subnet's Docker bridge gateway, and the shared akal-lab-network gateway)
 * rather than duplicating this logic per call site.
 */
export function buildGatewayAllowCommands(
  gatewayIp: string,
  rawProto: string,
  port: string,
  iptablesAction: IptablesAction
): string[][] {
  if (!gatewayIp) return [];

  if (rawProto === 'all' && port === 'ALL') {
    if (iptablesAction === 'REJECT') {
      return [
        ['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-p', 'tcp', '-j', 'REJECT', '--reject-with', 'tcp-reset'],
        ['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-j', 'REJECT']
      ];
    }
    return [['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-j', iptablesAction]];
  }

  if (rawProto === 'icmp') {
    return [['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-p', 'icmp', '-j', iptablesAction]];
  }

  if (rawProto === 'all') {
    if (iptablesAction === 'REJECT') {
      return [
        ['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-p', 'tcp', '--dport', port, '-j', 'REJECT', '--reject-with', 'tcp-reset'],
        ['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-p', 'udp', '--dport', port, '-j', 'REJECT']
      ];
    }
    return [
      ['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-p', 'tcp', '--dport', port, '-j', iptablesAction],
      ['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-p', 'udp', '--dport', port, '-j', iptablesAction]
    ];
  }

  if (port === 'ALL') {
    if (iptablesAction === 'REJECT' && rawProto === 'tcp') {
      return [['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-p', rawProto, '-j', 'REJECT', '--reject-with', 'tcp-reset']];
    }
    return [['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-p', rawProto, '-j', iptablesAction]];
  }

  if (iptablesAction === 'REJECT' && rawProto === 'tcp') {
    return [['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-p', rawProto, '--dport', port, '-j', 'REJECT', '--reject-with', 'tcp-reset']];
  }
  return [['iptables', '-A', 'AKAL-INPUT', '-s', gatewayIp, '-p', rawProto, '--dport', port, '-j', iptablesAction]];
}
