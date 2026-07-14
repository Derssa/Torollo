/**
 * Pure CIDR/gateway address helpers shared across network enforcement.
 * Docker may shift a subnet to a different pool on overlap (see `ensureNetwork`),
 * so these always derive addresses from the CIDR that was actually resolved,
 * never from the originally requested one.
 */

/** Extracts the dotted third-octet prefix (e.g. '10.0.1.0/24' -> '10.0.1.'), or '' if unparseable. */
export function getSubnetPrefix(cidr: string): string {
  const match = cidr.match(/^(\d+\.\d+\.\d+)\./);
  return match ? `${match[1]}.` : '';
}

/** The Docker bridge gateway address for a subnet (prefix + .1). */
export function getDockerGatewayIp(cidr: string): string {
  const prefix = getSubnetPrefix(cidr);
  return prefix ? `${prefix}1` : '';
}

/** The reserved NAT Gateway address inside a private subnet (prefix + .254). */
export function getNatGatewayIp(cidr: string): string {
  const prefix = getSubnetPrefix(cidr);
  return prefix ? `${prefix}254` : '';
}

/**
 * Shifts the VPC CIDR's second octet to track a subnet that Docker moved to a
 * different pool on overlap, so the VPC CIDR keeps matching its subnets.
 */
export function resolveVpcCidrShift(vpcCidr: string, firstResolvedCidr?: string): string {
  if (!firstResolvedCidr) return vpcCidr;

  const resolvedParts = firstResolvedCidr.split('.');
  const vpcParts = vpcCidr.split('.');
  if (resolvedParts.length > 1 && vpcParts.length > 1) {
    vpcParts[1] = resolvedParts[1];
    return vpcParts.join('.');
  }
  return vpcCidr;
}
