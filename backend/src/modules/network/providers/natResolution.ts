import { VirtualEndpoint } from '../mapper/virtualNetworkMapper';

/**
 * Finds the subnet's default route (0.0.0.0/0) that points at a NAT Gateway,
 * whether the route target names it directly (starts with 'nat'), or names
 * the endpoint's IP/container name of a container labeled as a NAT node.
 */
export function findNatRoute(subnet: any, endpoints: VirtualEndpoint[], config: any, dockerContainers: any[], projectId: string) {
  if (!subnet || !subnet.routes) return null;
  return subnet.routes.find((r: any) => {
    if (r.destination !== '0.0.0.0/0') return false;
    const targetLower = r.target.toLowerCase();
    if (targetLower.startsWith('nat')) return true;

    // Check if target matches the IP address or name of a NAT node
    const matchedNatEp = endpoints.find(e => {
      const containerInfo = dockerContainers.find(c => c.Id === e.nodeId);
      const isNat = containerInfo?.Labels?.['akal.node.type'] === 'nat';
      if (!isNat) return false;

      const epIp = config.nodeIpMap?.[e.nodeId];
      const cleanName = e.containerName.replace(`akal-lab-${projectId}-`, '');
      return r.target === epIp || targetLower === cleanName.toLowerCase();
    });
    return !!matchedNatEp;
  });
}

/** Resolves a NAT route's target to the actual endpoint acting as the NAT Gateway. */
export function findNatEndpoint(natRoute: any, endpoints: VirtualEndpoint[], config: any, projectId: string): VirtualEndpoint | undefined {
  if (!natRoute) return undefined;
  let natEp = endpoints.find(e => {
    const cleanName = e.containerName.replace(`akal-lab-${projectId}-`, '');
    return e.containerName === natRoute.target ||
           cleanName.toLowerCase() === natRoute.target.toLowerCase() ||
           e.containerName === `akal-lab-${projectId}-${natRoute.target}`;
  });

  if (!natEp && config.nodeIpMap) {
    const matchedNodeId = Object.keys(config.nodeIpMap).find(nodeId => config.nodeIpMap[nodeId] === natRoute.target);
    if (matchedNodeId) {
      natEp = endpoints.find(e => e.nodeId === matchedNodeId);
    }
  }
  return natEp;
}
