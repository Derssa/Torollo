/**
 * Canonical network topology types shared across the canvas, node modals
 * and the architecture validator.
 */

export interface VPCConfig {
  name: string;
  cidr: string;
  dnsEnabled: boolean;
  igwEnabled: boolean;
  description: string;
}

export interface SecurityGroupRule {
  id: string;
  type: 'inbound' | 'outbound';
  action: 'ALLOW' | 'DENY';
  protocol: 'ALL' | 'TCP' | 'UDP' | 'ICMP';
  port: string; // e.g. "80", "5432", "ALL"
  source: string; // e.g. "0.0.0.0/0", "subnet-id", "node-id"
}

export interface SubnetRoute {
  destination: string;
  target: string;
  description: string;
}

export interface Subnet {
  id: string;
  name: string;
  type: 'public' | 'private';
  cidr?: string;
  vpcId: string | null;
  position: { x: number; y: number };
  width: number;
  height: number;
  columns?: number;
  rows?: number;
  routes: SubnetRoute[];
}

export interface AsgConfig {
  desiredCapacity: number;
  minCapacity: number;
  maxCapacity: number;
  parentId: string;
  subnetIds: string[];
}

export interface NetworkConfig {
  vpcConfig: VPCConfig;
  subnets: Subnet[];
  nodeSubnetMap: Record<string, string>; // nodeId -> subnetId or vpcId
  nodeSecurityGroups: Record<string, SecurityGroupRule[]>; // nodeId -> SecurityGroupRule[]
  nodeIpMap: Record<string, string>; // nodeId -> ipAddress
  loadBalancerAlgorithms?: Record<string, 'round_robin' | 'least_conn'>;
  loadBalancerTargets?: Record<string, string[]>;
  loadBalancerTargetPorts?: Record<string, number>;
  loadBalancerRoutingRules?: Record<string, Array<{ path: string; targetId: string }>>;
  asgs?: Record<string, AsgConfig>;
}
