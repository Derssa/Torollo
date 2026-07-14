import type { Edge } from '@xyflow/react';
import type { ContainerData } from '../../../shared/types';
import type { NetworkConfig, SecurityGroupRule } from '../../../shared/types/network';

/**
 * Pure security-group rule logic: the canvas edges are a projection of the
 * inbound ALLOW rules, so edge create/delete always translates to rule
 * add/remove on the target node's security group.
 */

/** Default security group: deny all inbound, allow all outbound. */
export function createDefaultRules(): SecurityGroupRule[] {
  return [
    {
      id: `rule-${Math.random().toString(36).substr(2, 9)}`,
      type: 'inbound',
      action: 'DENY',
      protocol: 'ALL',
      port: 'ALL',
      source: '0.0.0.0/0',
    },
    {
      id: `rule-${Math.random().toString(36).substr(2, 9)}`,
      type: 'outbound',
      action: 'ALLOW',
      protocol: 'ALL',
      port: 'ALL',
      source: '0.0.0.0/0',
    },
  ];
}

/** Inbound ALLOW rule for a manual connection, with the target type's default port. */
export function buildConnectionRule(sourceId: string, targetType: string): SecurityGroupRule {
  const isDb = ['postgres', 'sql', 'nosql', 'mysql', 'redis'].includes(targetType);
  const port =
    (targetType === 'postgres' || targetType === 'sql') ? '5432'
      : targetType === 'nosql' ? '27017'
      : targetType === 'mysql' ? '3306'
      : targetType === 'redis' ? '6379'
      : 'ALL';

  return {
    id: `rule-${Math.random().toString(36).substr(2, 9)}`,
    type: 'inbound',
    action: 'ALLOW',
    protocol: isDb ? 'TCP' : 'ALL',
    port,
    source: sourceId,
  };
}

/**
 * Add the connection rule for source → target to the config.
 * Returns null when an equivalent rule already exists (no-op).
 */
export function addConnectionRule(
  config: NetworkConfig,
  sourceId: string,
  targetId: string,
  targetType: string
): { config: NetworkConfig; port: string } | null {
  const newRule = buildConnectionRule(sourceId, targetType);
  const currentRules = config.nodeSecurityGroups[targetId] || [];
  const alreadyExists = currentRules.some(
    r => r.type === 'inbound' && r.action === 'ALLOW' && r.port === newRule.port && r.source === sourceId
  );
  if (alreadyExists) return null;

  return {
    config: {
      ...config,
      nodeSecurityGroups: {
        ...config.nodeSecurityGroups,
        [targetId]: [newRule, ...currentRules],
      },
    },
    port: newRule.port,
  };
}

/** Parse an `edge-{sourceId}-{targetId}-{port}` id built by buildFirewallEdges. */
export function parseEdgeId(edgeId: string): { sourceId: string; targetId: string; port: string } | null {
  const match = edgeId.match(/^edge-([^-]+)-([^-]+)-(.+)$/);
  if (!match) return null;
  const [, sourceId, targetId, port] = match;
  return { sourceId, targetId, port };
}

/**
 * Remove the inbound ALLOW rule matching a deleted edge from the target's
 * security group. Returns null when the target has no security group.
 */
export function removeEdgeRule(
  config: NetworkConfig,
  sourceId: string,
  targetId: string,
  port: string
): NetworkConfig | null {
  const targetRules = config.nodeSecurityGroups[targetId];
  if (!targetRules) return null;

  return {
    ...config,
    nodeSecurityGroups: {
      ...config.nodeSecurityGroups,
      [targetId]: targetRules.filter(
        rule => !(
          rule.type === 'inbound' &&
          rule.action === 'ALLOW' &&
          rule.port === port &&
          (rule.source === sourceId || rule.source === '0.0.0.0/0')
        )
      ),
    },
  };
}

/**
 * Remove the inbound ALLOW rules matching the given source → target pairs
 * (any port). Returns null when nothing matched.
 */
export function removeRulesForConnections(
  config: NetworkConfig,
  pairs: Array<{ source: string; target: string }>
): NetworkConfig | null {
  const updatedSecurityGroups = { ...config.nodeSecurityGroups };
  let changed = false;

  pairs.forEach(({ source, target }) => {
    if (updatedSecurityGroups[target]) {
      updatedSecurityGroups[target] = updatedSecurityGroups[target].filter(rule => {
        const isMatch = rule.type === 'inbound' && rule.action === 'ALLOW' && (rule.source === source || rule.source === '0.0.0.0/0');
        if (isMatch) changed = true;
        return !isMatch;
      });
    }
  });

  if (!changed) return null;
  return { ...config, nodeSecurityGroups: updatedSecurityGroups };
}

/**
 * Project the inbound ALLOW rules onto canvas edges: one edge per
 * (source, target, port) where both nodes sit in subnets of the same VPC and
 * the source matches the rule (wildcard, subnet id or node id). NAT gateways
 * never appear as edge endpoints.
 */
export function buildFirewallEdges(
  containers: ContainerData[],
  config: NetworkConfig,
  onDelete: (edgeId: string) => void
): Edge[] {
  const edgesList: Edge[] = [];

  containers.forEach(destNode => {
    if (destNode.type === 'nat') return;
    const destRules = config.nodeSecurityGroups[destNode.id] || [];
    const destSubnetId = config.nodeSubnetMap[destNode.id];
    if (!destSubnetId) return;
    const destSubnet = config.subnets.find(s => s.id === destSubnetId);
    const destVpcId = destSubnet?.vpcId;
    if (!destVpcId) return;

    const inboundAllowRules = destRules.filter(r => r.type === 'inbound' && r.action === 'ALLOW');

    inboundAllowRules.forEach(rule => {
      containers.forEach(srcNode => {
        if (srcNode.id === destNode.id) return;
        if (srcNode.type === 'nat') return;

        const srcSubnetId = config.nodeSubnetMap[srcNode.id];
        if (!srcSubnetId) return;
        const srcSubnet = config.subnets.find(s => s.id === srcSubnetId);
        const srcVpcId = srcSubnet?.vpcId;

        // Must be in the same VPC
        if (srcVpcId !== destVpcId) return;

        // Check if source matches rule
        const isMatch =
          rule.source === '0.0.0.0/0' ||
          rule.source === srcSubnetId ||
          rule.source === srcNode.id;

        if (isMatch) {
          const edgeId = `edge-${srcNode.id}-${destNode.id}-${rule.port}`;
          if (!edgesList.some(e => e.id === edgeId)) {
            edgesList.push({
              id: edgeId,
              source: srcNode.id,
              target: destNode.id,
              type: 'buttonEdge',
              data: { onDelete },
              animated: true,
              label: `Port ${rule.port}`,
              style: { stroke: '#10B981', strokeWidth: 2 },
              labelStyle: { fill: '#374151', fontSize: 9, fontWeight: 700 },
            });
          }
        }
      });
    });
  });

  return edgesList;
}
