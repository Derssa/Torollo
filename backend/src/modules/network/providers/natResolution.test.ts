import { findNatRoute, findNatEndpoint } from './natResolution';
import { VirtualEndpoint } from '../mapper/virtualNetworkMapper';

const projectId = 'proj-1';

const endpoint = (nodeId: string, containerName: string): VirtualEndpoint => ({
  nodeId,
  projectId,
  containerName
});

describe('findNatRoute', () => {
  it('returns null when the subnet has no routes', () => {
    expect(findNatRoute({ routes: [] }, [], {}, [], projectId)).toBeUndefined();
    expect(findNatRoute(null, [], {}, [], projectId)).toBeNull();
  });

  it('matches a route whose target literally starts with "nat"', () => {
    const subnet = { routes: [{ destination: '0.0.0.0/0', target: 'nat-gw' }] };
    expect(findNatRoute(subnet, [], {}, [], projectId)).toBe(subnet.routes[0]);
  });

  it('ignores routes that are not the default route', () => {
    const subnet = { routes: [{ destination: '10.0.0.0/16', target: 'local' }] };
    expect(findNatRoute(subnet, [], {}, [], projectId)).toBeUndefined();
  });

  it('matches a route targeting the IP of a container labeled as NAT', () => {
    const natEp = endpoint('nat-node', `akal-lab-${projectId}-nat-node`);
    const subnet = { routes: [{ destination: '0.0.0.0/0', target: '10.0.1.254' }] };
    const config = { nodeIpMap: { 'nat-node': '10.0.1.254' } };
    const dockerContainers = [{ Id: 'nat-node', Labels: { 'akal.node.type': 'nat' } }];

    expect(findNatRoute(subnet, [natEp], config, dockerContainers, projectId)).toBe(subnet.routes[0]);
  });

  it('matches a route targeting the clean container name of a NAT-labeled container', () => {
    const natEp = endpoint('nat-node', `akal-lab-${projectId}-nat-node`);
    const subnet = { routes: [{ destination: '0.0.0.0/0', target: 'NAT-Node' }] };
    const config = {};
    const dockerContainers = [{ Id: 'nat-node', Labels: { 'akal.node.type': 'nat' } }];

    expect(findNatRoute(subnet, [natEp], config, dockerContainers, projectId)).toBe(subnet.routes[0]);
  });

  it('does not match a default route targeting a non-NAT container', () => {
    const ep = endpoint('web-node', `akal-lab-${projectId}-web-node`);
    const subnet = { routes: [{ destination: '0.0.0.0/0', target: 'web-node' }] };
    const dockerContainers = [{ Id: 'web-node', Labels: { 'akal.node.type': 'ubuntu' } }];

    expect(findNatRoute(subnet, [ep], {}, dockerContainers, projectId)).toBeUndefined();
  });
});

describe('findNatEndpoint', () => {
  it('returns undefined when there is no NAT route', () => {
    expect(findNatEndpoint(null, [], {}, projectId)).toBeUndefined();
  });

  it('resolves by exact container name', () => {
    const ep = endpoint('nat-node', `akal-lab-${projectId}-nat-node`);
    const natRoute = { target: `akal-lab-${projectId}-nat-node` };
    expect(findNatEndpoint(natRoute, [ep], {}, projectId)).toBe(ep);
  });

  it('resolves by clean (project-prefix-stripped) name, case-insensitively', () => {
    const ep = endpoint('nat-node', `akal-lab-${projectId}-nat-node`);
    const natRoute = { target: 'NAT-NODE' };
    expect(findNatEndpoint(natRoute, [ep], {}, projectId)).toBe(ep);
  });

  it('resolves by bare node id prefixed with the project namespace', () => {
    const ep = endpoint('nat-node', `akal-lab-${projectId}-nat-node`);
    const natRoute = { target: 'nat-node' };
    expect(findNatEndpoint(natRoute, [ep], {}, projectId)).toBe(ep);
  });

  it('falls back to resolving via nodeIpMap when no name matches', () => {
    const ep = endpoint('nat-node', 'some-other-name');
    const natRoute = { target: '10.0.1.254' };
    const config = { nodeIpMap: { 'nat-node': '10.0.1.254' } };
    expect(findNatEndpoint(natRoute, [ep], config, projectId)).toBe(ep);
  });

  it('returns undefined when nothing matches', () => {
    const ep = endpoint('nat-node', 'some-other-name');
    const natRoute = { target: 'unknown' };
    expect(findNatEndpoint(natRoute, [ep], {}, projectId)).toBeUndefined();
  });
});
