import type { NetworkConfig, Subnet } from '../../../shared/types/network';
import { subnetSize } from './canvasGeometry';
import { createDefaultRules } from './securityRules';

/**
 * Pure transforms of the NetworkConfig: subnet creation/sizing, node↔subnet
 * assignment and the cleanup cascades. All functions return a new config and
 * never mutate their input.
 */

/** Recompute every subnet's pixel dimensions from its grid size. */
export function autoGrowContainers(config: NetworkConfig): NetworkConfig {
  return {
    ...config,
    subnets: config.subnets.map(subnet => ({
      ...subnet,
      ...subnetSize(subnet.columns || 2, subnet.rows || 1),
    })),
  };
}

/**
 * IP for a node inside a subnet: keep its current IP when it already belongs
 * to the subnet's CIDR, otherwise the lowest free host suffix starting at .2.
 * Returns '' when the subnet is unknown or its CIDR is malformed.
 */
export function allocateIpForNode(nodeId: string, subnetId: string, currentConfig: NetworkConfig): string {
  const subnet = currentConfig.subnets.find(s => s.id === subnetId);
  if (!subnet) return '';
  const cidr = subnet.cidr || '10.99.1.0/24';
  const match = cidr.match(/^(\d+\.\d+\.\d+)\./);
  if (!match) return '';
  const prefix = match[1] + '.';

  const existingIp = currentConfig.nodeIpMap?.[nodeId];
  if (existingIp && existingIp.startsWith(prefix)) {
    return existingIp;
  }

  const assignedIps = Object.entries(currentConfig.nodeIpMap || {})
    .filter(([nid, ip]) => currentConfig.nodeSubnetMap[nid] === subnetId && ip.startsWith(prefix))
    .map(([, ip]) => {
      const parts = ip.split('.');
      return parseInt(parts[3], 10);
    });

  let suffix = 2;
  while (assignedIps.includes(suffix)) {
    suffix++;
  }

  return `${prefix}${suffix}`;
}

/**
 * Place a node in a subnet: map it, give it the default security group when
 * it has none, and allocate its IP.
 */
export function assignNodeToSubnet(config: NetworkConfig, nodeId: string, subnetId: string): NetworkConfig {
  const nodeSecurityGroups = { ...config.nodeSecurityGroups };
  if (!nodeSecurityGroups[nodeId] || nodeSecurityGroups[nodeId].length === 0) {
    nodeSecurityGroups[nodeId] = createDefaultRules();
  }

  const assigned: NetworkConfig = {
    ...config,
    nodeSubnetMap: { ...config.nodeSubnetMap, [nodeId]: subnetId },
    nodeSecurityGroups,
  };

  return {
    ...assigned,
    nodeIpMap: { ...assigned.nodeIpMap, [nodeId]: allocateIpForNode(nodeId, subnetId, assigned) },
  };
}

/**
 * Cascade a node deletion: drop its subnet mapping, security group and IP,
 * and strip other nodes' rules that referenced it as a source.
 */
export function removeNodeFromConfig(config: NetworkConfig, nodeId: string): NetworkConfig {
  const nodeSubnetMap = { ...config.nodeSubnetMap };
  delete nodeSubnetMap[nodeId];

  const nodeSecurityGroups = { ...config.nodeSecurityGroups };
  delete nodeSecurityGroups[nodeId];
  Object.keys(nodeSecurityGroups).forEach(otherId => {
    nodeSecurityGroups[otherId] = nodeSecurityGroups[otherId].filter(rule => rule.source !== nodeId);
  });

  const nodeIpMap = { ...(config.nodeIpMap || {}) };
  delete nodeIpMap[nodeId];

  return { ...config, nodeSubnetMap, nodeSecurityGroups, nodeIpMap };
}

/**
 * New 2x1 subnet dropped on the canvas. The subnet CIDR and local route are
 * derived from the current VPC CIDR: it may have shifted from the default
 * 10.0.0.0/16 when Docker's address pool overlapped the requested range.
 */
export function createSubnet(
  type: 'public' | 'private',
  position: { x: number; y: number },
  vpcCidr: string,
  existingCount: number
): Subnet {
  const isPublic = type === 'public';
  const cols = 2;
  const rows = 1;
  const vpcPrefix = vpcCidr.split('.').slice(0, 2).join('.');

  return {
    id: `subnet-${Math.random().toString(36).substr(2, 9)}`,
    name: `${isPublic ? 'Public' : 'Private'} Subnet-${existingCount + 1}`,
    type,
    cidr: `${vpcPrefix}.${existingCount + 1}.0/24`,
    vpcId: 'root-vpc',
    position,
    ...subnetSize(cols, rows),
    columns: cols,
    rows,
    routes: [
      { destination: vpcCidr, target: 'local', description: 'Local VPC routing' },
      ...(isPublic ? [{ destination: '0.0.0.0/0', target: 'igw', description: 'Internet access' }] : []),
    ],
  };
}
