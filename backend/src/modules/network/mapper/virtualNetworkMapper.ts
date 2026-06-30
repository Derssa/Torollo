export interface VirtualEndpoint {
  nodeId: string;
  projectId: string;
  containerName: string;
  ipAddress?: string;
}

export class VirtualNetworkMapper {
  public static mapNodesToEndpoints(projectId: string, nodeIds: string[]): VirtualEndpoint[] {
    return nodeIds.map(nodeId => {
      const safeNodeName = nodeId.replace(/[^a-zA-Z0-9-_]/g, '');
      const containerName = `torollo-lab-${projectId}-${safeNodeName}`;
      return {
        nodeId,
        projectId,
        containerName
      };
    });
  }
}
