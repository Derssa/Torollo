/**
 * When Docker cannot honor a requested CIDR (address pool overlap), enforcement
 * shifts to a free range and the shifted values must be persisted. Saving the
 * whole in-flight config back would clobber any save that landed while the
 * plan was running, so instead we diff what enforcement actually produced
 * against what was requested and merge only those corrections into a freshly
 * read config.
 */

export interface CidrCorrections {
  vpcCidr?: string;
  subnetCidrs: Record<string, string>;
  nodeIps: Record<string, string>;
}

/**
 * Builds the correction patch for a finished plan. A resolved value that
 * merely echoes the requested one never enters the patch, so applying it can
 * never revert a newer user-chosen value. Returns null when nothing shifted.
 */
export function buildCidrCorrections(
  config: any,
  vpcCidr: string,
  resolvedCidrs: Record<string, string>,
  ipMap: Record<string, string>
): CidrCorrections | null {
  const patch: CidrCorrections = { subnetCidrs: {}, nodeIps: {} };
  let changed = false;

  // 'local' routes represent the VPC route, so they must track the enforced
  // VPC CIDR. A stale destination can appear even when the VPC did not shift
  // in this run: subnets created after a shift was persisted still carry the
  // default 10.0.0.0/16 destination.
  const vpcStale =
    (config.vpcConfig && config.vpcConfig.cidr !== vpcCidr) ||
    (config.subnets || []).some((s: any) =>
      (s.routes || []).some((r: any) => r.target === 'local' && r.destination !== vpcCidr)
    );
  if (vpcStale) {
    patch.vpcCidr = vpcCidr;
    changed = true;
  }

  for (const subnet of config.subnets || []) {
    const resolved = resolvedCidrs[subnet.id];
    if (resolved && subnet.cidr !== resolved) {
      patch.subnetCidrs[subnet.id] = resolved;
      changed = true;
    }
  }

  for (const [nodeId, ip] of Object.entries(ipMap)) {
    if (config.nodeIpMap?.[nodeId] !== ip) {
      patch.nodeIps[nodeId] = ip;
      changed = true;
    }
  }

  return changed ? patch : null;
}

/** Merges a correction patch into a config, mutating it in place. */
export function applyCidrCorrections(config: any, patch: CidrCorrections): void {
  if (patch.vpcCidr) {
    if (config.vpcConfig) {
      config.vpcConfig.cidr = patch.vpcCidr;
    }
    // Routes targeting 'local' cover the whole VPC and must follow the shift.
    for (const subnet of config.subnets || []) {
      for (const route of subnet.routes || []) {
        if (route.target === 'local') {
          route.destination = patch.vpcCidr;
        }
      }
    }
  }

  for (const subnet of config.subnets || []) {
    const cidr = patch.subnetCidrs[subnet.id];
    if (cidr) {
      subnet.cidr = cidr;
    }
  }

  if (Object.keys(patch.nodeIps).length > 0) {
    config.nodeIpMap = { ...config.nodeIpMap, ...patch.nodeIps };
  }
}
