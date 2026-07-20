import type { ContainerData } from '../types';
import type { NetworkConfig as FullNetworkConfig } from '../types/network';

/** The validator only reads the topology-related slice of the network config. */
export type NetworkConfig = Pick<FullNetworkConfig, 'subnets' | 'nodeSubnetMap' | 'nodeSecurityGroups'>;

/**
 * A validation finding as a translation key plus its interpolation params,
 * NOT a rendered string. The UI language is unknown here (this is a pure util),
 * so the caller resolves `audit.<key>` against i18next at display time. `key`
 * is also a stable identity the caller can dedupe on (e.g. the cache warning).
 */
export interface ValidationMessage {
  key: string;
  params?: Record<string, string | number>;
}

export interface ValidationResult {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  successes: ValidationMessage[];
}

export function validateArchitecture(
  networkConfig: NetworkConfig,
  containers: ContainerData[]
): ValidationResult {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  const successes: ValidationMessage[] = [];

  const dbTypes = ['postgres', 'sql', 'nosql', 'mysql'];
  // Data stores that should be kept private and never exposed publicly. Redis is a
  // cache rather than a relational DB tier, so it is tracked separately from dbTypes.
  const sensitiveTypes = [...dbTypes, 'redis'];

  // --- 1. ERROR CHECKS ---
  
  // Nodes must map to subnets that exist (if they map to one)
  containers.forEach(node => {
    const subnetId = networkConfig.nodeSubnetMap[node.id];
    if (subnetId && !subnetId.startsWith('vpc-')) {
      const subnet = networkConfig.subnets.find(s => s.id === subnetId);
      if (!subnet) {
        errors.push({ key: 'nodeMissingSubnet', params: { name: node.name } });
      }
    }
  });

  // --- 2. WARNING CHECKS ---

  // Data store in public subnet check
  containers.forEach(node => {
    const isSensitive = sensitiveTypes.includes(node.type || '');
    if (isSensitive) {
      const subnetId = networkConfig.nodeSubnetMap[node.id];
      if (subnetId) {
        const subnet = networkConfig.subnets.find(s => s.id === subnetId);
        if (subnet && subnet.type === 'public') {
          warnings.push({ key: 'dataStorePublicSubnet', params: { name: node.name } });
        }
      }
    }
  });

  // Data store 0.0.0.0/0 exposure check
  containers.forEach(node => {
    const isSensitive = sensitiveTypes.includes(node.type || '');
    if (isSensitive) {
      const rules = networkConfig.nodeSecurityGroups[node.id] || [];
      const hasPublicAccess = rules.some(
        rule => rule.type === 'inbound' && rule.action === 'ALLOW' && rule.source === '0.0.0.0/0'
      );
      if (hasPublicAccess) {
        warnings.push({ key: 'dataStorePublicExposure', params: { name: node.name } });
      }
    }
  });

  // Check for Redis/caching tier (by node type or by name, for backwards compatibility)
  const hasCacheNode = containers.some(c => {
    const name = c.name.toLowerCase();
    return c.type === 'redis' || name.includes('redis') || name.includes('cache') || name.includes('memcached');
  });
  if (containers.length > 0 && !hasCacheNode) {
    // Only warn if there's at least one DB
    const hasDb = containers.some(c => dbTypes.includes(c.type || ''));
    if (hasDb) {
      warnings.push({ key: 'noCachingTier' });
    }
  }

  // Helper: check if node is client-facing / gateway
  const isPublicFacingNode = (node: ContainerData, subnetType?: 'public' | 'private') => {
    const name = node.name.toLowerCase();
    const isAppType = node.type === 'ubuntu';
    const hasPublicKeywords = name.includes('client') || name.includes('frontend') || name.includes('gateway') || name.includes('api') || name.includes('web') || name.includes('nginx') || name.includes('proxy');
    return isAppType && (subnetType === 'public' || hasPublicKeywords);
  };

  // Direct client-to-DB connection OR DB connection checks
  containers.forEach(dbNode => {
    const isDb = dbTypes.includes(dbNode.type || '');
    if (!isDb) return;

    const rules = networkConfig.nodeSecurityGroups[dbNode.id] || [];
    rules.forEach(rule => {
      if (rule.type === 'inbound' && rule.action === 'ALLOW') {
        const srcNode = containers.find(c => c.id === rule.source);
        if (srcNode) {
          const srcSubnetId = networkConfig.nodeSubnetMap[srcNode.id];
          const srcSubnet = networkConfig.subnets.find(s => s.id === srcSubnetId);
          if (isPublicFacingNode(srcNode, srcSubnet?.type)) {
            warnings.push({ key: 'directPublicToDb', params: { db: dbNode.name, src: srcNode.name } });
          }
        }
      }
    });
  });

  // --- 3. SUCCESS CHECKS ---
  // If we have a multi-tier layout:
  // Public Gateway/Frontend Node (in Public Subnet) -> App Backend Node (in Private Subnet) -> Database Node (in Private Subnet)
  let hasPublicFrontend = false;
  let hasPrivateBackend = false;
  let hasPrivateDb = false;

  let publicFrontendId = '';
  let privateBackendId = '';
  let privateDbId = '';

  containers.forEach(node => {
    const subnetId = networkConfig.nodeSubnetMap[node.id];
    const subnet = networkConfig.subnets.find(s => s.id === subnetId);
    if (!subnet) return;

    if (subnet.type === 'public' && isPublicFacingNode(node, 'public')) {
      hasPublicFrontend = true;
      publicFrontendId = node.id;
    } else if (subnet.type === 'private' && node.type === 'ubuntu' && !node.name.toLowerCase().includes('redis') && !node.name.toLowerCase().includes('cache')) {
      hasPrivateBackend = true;
      privateBackendId = node.id;
    } else if (subnet.type === 'private' && dbTypes.includes(node.type || '')) {
      hasPrivateDb = true;
      privateDbId = node.id;
    }
  });

  if (hasPublicFrontend && hasPrivateBackend && hasPrivateDb) {
    // Check flow: Frontend -> Backend -> DB
    const backendRules = networkConfig.nodeSecurityGroups[privateBackendId] || [];
    const dbRules = networkConfig.nodeSecurityGroups[privateDbId] || [];

    const isFrontendToBackend = backendRules.some(
      r => r.type === 'inbound' && r.action === 'ALLOW' && (r.source === publicFrontendId || r.source === networkConfig.nodeSubnetMap[publicFrontendId])
    );
    const isBackendToDb = dbRules.some(
      r => r.type === 'inbound' && r.action === 'ALLOW' && (r.source === privateBackendId || r.source === networkConfig.nodeSubnetMap[privateBackendId])
    );

    if (isFrontendToBackend && isBackendToDb) {
      // Check if DB is isolated from public frontend
      const directFromFrontendToDb = dbRules.some(
        r => r.type === 'inbound' && r.action === 'ALLOW' && (r.source === publicFrontendId || r.source === '0.0.0.0/0')
      );

      if (!directFromFrontendToDb) {
        successes.push({ key: 'secure3Tier' });
      }
    }
  }

  // Default success if everything is healthy and configured in subnets/VPCs
  if (errors.length === 0 && warnings.length === 0 && containers.length >= 2) {
    successes.push({ key: 'vpcValid' });
  }

  return { errors, warnings, successes };
}
