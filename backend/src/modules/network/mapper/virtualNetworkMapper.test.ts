import { VirtualNetworkMapper } from './virtualNetworkMapper';

describe('VirtualNetworkMapper', () => {
  it('should map nodeIds to virtual endpoints with correct container names', () => {
    const projectId = 'test-project';
    const nodeIds = ['ubuntu-node-1', 'postgres_db', 'nosql-3-node'];
    
    const endpoints = VirtualNetworkMapper.mapNodesToEndpoints(projectId, nodeIds);
    
    expect(endpoints).toHaveLength(3);
    expect(endpoints[0]).toEqual({
      nodeId: 'ubuntu-node-1',
      projectId: 'test-project',
      containerName: 'akal-lab-test-project-ubuntu-node-1'
    });
    expect(endpoints[1]).toEqual({
      nodeId: 'postgres_db',
      projectId: 'test-project',
      containerName: 'akal-lab-test-project-postgres_db'
    });
    expect(endpoints[2]).toEqual({
      nodeId: 'nosql-3-node',
      projectId: 'test-project',
      containerName: 'akal-lab-test-project-nosql-3-node'
    });
  });

  it('should sanitize characters correctly to generate valid container names', () => {
    const projectId = 'p-123';
    const nodeIds = ['node@123!', 'node_name#test'];
    const endpoints = VirtualNetworkMapper.mapNodesToEndpoints(projectId, nodeIds);
    expect(endpoints[0].containerName).toBe('akal-lab-p-123-node123');
    expect(endpoints[1].containerName).toBe('akal-lab-p-123-node_nametest');
  });

  it('should return no endpoints for a project with no placed node', () => {
    expect(VirtualNetworkMapper.mapNodesToEndpoints('p-123', [])).toEqual([]);
  });

  it('should leave an already-safe node id untouched', () => {
    const [endpoint] = VirtualNetworkMapper.mapNodesToEndpoints('p-123', ['web_db-1']);
    expect(endpoint!.containerName).toBe('akal-lab-p-123-web_db-1');
  });

  it('should not disambiguate two node ids that sanitize to the same name', () => {
    // Documented behaviour: sanitization can collide. Node ids are generated
    // (uuid-like), so this never happens in practice — but nothing guards it.
    const endpoints = VirtualNetworkMapper.mapNodesToEndpoints('p-123', ['node.1', 'node/1']);

    expect(endpoints[0]!.containerName).toBe(endpoints[1]!.containerName);
    expect(endpoints[0]!.nodeId).not.toBe(endpoints[1]!.nodeId);
  });
});
