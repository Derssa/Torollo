export interface SemanticRule {
  sourceNodeId: string;
  targetNodeId: string;
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  port: string; // 'ALL' or numeric e.g. '5432'
  action: 'ALLOW' | 'DENY';
  direction: 'inbound' | 'outbound';
  ownerNodeId: string;
}

/**
 * A security-group rule exactly as the canvas persists it: casing is free and
 * most fields are optional — `computeSemanticRules` is what normalizes them.
 */
export interface SecurityGroupRuleInput {
  type: 'inbound' | 'outbound';
  action?: 'ALLOW' | 'DENY';
  protocol?: string;
  port?: string;
  source: string; // '0.0.0.0/0', a 'subnet-…' id, or a node id
}

/**
 * Backend view of a project's persisted network config (`~/.torollo/projects.json`).
 * Partial mirror of the canonical `NetworkConfig` in the frontend package
 * (`frontend/src/shared/types/network.ts`), which the backend never imports.
 * The index signature keeps the remaining fields (`subnets`, `vpcConfig`, the
 * load-balancer maps…) flowing untouched to the Docker provider, which still
 * reads them untyped.
 */
export interface NetworkConfigInput {
  nodeSubnetMap?: Record<string, string>;
  nodeSecurityGroups?: Record<string, SecurityGroupRuleInput[]>;
  asgs?: Record<string, { parentId: string }>;
  [key: string]: unknown;
}

export interface NetworkPolicy {
  projectId: string;
  rules: SemanticRule[];
}
