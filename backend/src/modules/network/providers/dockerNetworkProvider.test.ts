import { EventEmitter } from 'events';
import docker from '../../../infrastructure/docker/DockerClient';
import { DockerNetworkProvider } from './dockerNetworkProvider';

jest.mock('../../../infrastructure/docker/DockerClient', () => ({
  __esModule: true,
  default: {
    listContainers: jest.fn(),
    listNetworks: jest.fn(),
    getContainer: jest.fn(),
    getNetwork: jest.fn(),
    createNetwork: jest.fn()
  }
}));

// Breaks a pre-existing require cycle (dockerNetworkProvider -> projectService ->
// networkService -> dockerNetworkProvider) that only resolves in production because
// networkService.ts happens to be the module first required. Importing this file
// directly as the test entry point hits the cycle from the other side instead.
jest.mock('../../projects/services/projectService', () => ({
  ProjectService: {
    getNetworkConfig: jest.fn(),
    saveNetworkConfig: jest.fn()
  }
}));

const mockedDocker = docker as jest.Mocked<typeof docker>;

/** A fake Dockerode container satisfying the exec/stream/modem shape `runExec` drives. */
function fakeExecContainer(output = '', exitCode = 0) {
  return {
    modem: {
      demuxStream: (stream: EventEmitter, stdout: { write: (c: Buffer) => void }) => {
        if (output) stdout.write(Buffer.from(output));
        setImmediate(() => stream.emit('end'));
      }
    },
    exec: jest.fn().mockResolvedValue({
      start: jest.fn().mockResolvedValue(new EventEmitter()),
      inspect: jest.fn().mockResolvedValue({ ExitCode: exitCode })
    })
  };
}

describe('DockerNetworkProvider.ensureNetwork', () => {
  const provider = new DockerNetworkProvider();
  const ensureNetwork = (netName: string, cidr: string, allNetworks: any[]) =>
    (provider as any).ensureNetwork(netName, cidr, allNetworks);

  it('creates the network with the requested CIDR when it does not exist yet', async () => {
    (mockedDocker.createNetwork as jest.Mock).mockResolvedValue(undefined);

    const result = await ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', []);

    expect(result).toBe('10.0.1.0/24');
    expect(mockedDocker.createNetwork).toHaveBeenCalledWith({
      Name: 'akal-subnet-p1-s1',
      Driver: 'bridge',
      IPAM: { Config: [{ Subnet: '10.0.1.0/24', Gateway: '10.0.1.1' }] }
    });
  });

  it('retries with a shifted second octet when the address pool overlaps, until it succeeds', async () => {
    (mockedDocker.createNetwork as jest.Mock)
      .mockRejectedValueOnce(new Error('Pool overlaps with other one on this address space'))
      .mockRejectedValueOnce(new Error('overlaps'))
      .mockResolvedValueOnce(undefined);

    const result = await ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', []);

    expect(result).toBe('10.112.1.0/24');
    expect(mockedDocker.createNetwork).toHaveBeenCalledTimes(3);
    expect(mockedDocker.createNetwork).toHaveBeenLastCalledWith({
      Name: 'akal-subnet-p1-s1',
      Driver: 'bridge',
      IPAM: { Config: [{ Subnet: '10.112.1.0/24', Gateway: '10.112.1.1' }] }
    });
  });

  it('gives up after 10 failed attempts due to persistent overlap', async () => {
    (mockedDocker.createNetwork as jest.Mock).mockRejectedValue(new Error('overlaps'));

    await expect(ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', [])).rejects.toThrow(
      'Failed to create network akal-subnet-p1-s1 after 10 attempts due to address space overlaps.'
    );
    expect(mockedDocker.createNetwork).toHaveBeenCalledTimes(10);
  });

  it('rethrows non-overlap errors immediately without retrying', async () => {
    (mockedDocker.createNetwork as jest.Mock).mockRejectedValue(new Error('permission denied'));

    await expect(ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', [])).rejects.toThrow('permission denied');
    expect(mockedDocker.createNetwork).toHaveBeenCalledTimes(1);
  });

  it('reuses an already-created network and returns its actual subnet instead of recreating it', async () => {
    const networkHandle = { inspect: jest.fn().mockResolvedValue({ IPAM: { Config: [{ Subnet: '10.99.1.0/24' }] } }) };
    (mockedDocker.getNetwork as jest.Mock).mockReturnValue(networkHandle);

    const result = await ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', [{ Name: 'akal-subnet-p1-s1' }]);

    expect(result).toBe('10.99.1.0/24');
    expect(mockedDocker.createNetwork).not.toHaveBeenCalled();
  });
});

describe('DockerNetworkProvider.cleanupProjectPolicies', () => {
  const provider = new DockerNetworkProvider();
  const projectId = 'proj-1';
  const endpoints = [{ nodeId: 'node-a', projectId, containerName: `akal-lab-${projectId}-node-a` }];

  it('flushes the AKAL chains inside a running container that has iptables installed', async () => {
    const execContainer = fakeExecContainer('/sbin/iptables');
    (mockedDocker.listContainers as jest.Mock).mockResolvedValue([
      { Id: 'c1', Names: [`/akal-lab-${projectId}-node-a`], State: 'running' }
    ]);
    (mockedDocker.getContainer as jest.Mock).mockReturnValue(execContainer);
    (mockedDocker.listNetworks as jest.Mock).mockResolvedValue([]);

    await provider.cleanupProjectPolicies(projectId, endpoints);

    const execCommands = (execContainer.exec as jest.Mock).mock.calls.map(([opts]) => opts.Cmd);
    expect(execCommands).toContainEqual(['iptables', '-F', 'AKAL-INPUT']);
    expect(execCommands).toContainEqual(['iptables', '-F', 'AKAL-OUTPUT']);
  });

  it('skips flushing chains for a container without iptables installed', async () => {
    const execContainer = fakeExecContainer('sh: iptables: not found');
    (mockedDocker.listContainers as jest.Mock).mockResolvedValue([
      { Id: 'c1', Names: [`/akal-lab-${projectId}-node-a`], State: 'running' }
    ]);
    (mockedDocker.getContainer as jest.Mock).mockReturnValue(execContainer);
    (mockedDocker.listNetworks as jest.Mock).mockResolvedValue([]);

    await provider.cleanupProjectPolicies(projectId, endpoints);

    const execCommands = (execContainer.exec as jest.Mock).mock.calls.map(([opts]) => opts.Cmd);
    expect(execCommands).not.toContainEqual(['iptables', '-F', 'AKAL-INPUT']);
  });

  it('does not touch stopped containers', async () => {
    (mockedDocker.listContainers as jest.Mock).mockResolvedValue([
      { Id: 'c1', Names: [`/akal-lab-${projectId}-node-a`], State: 'exited' }
    ]);
    (mockedDocker.listNetworks as jest.Mock).mockResolvedValue([]);

    await provider.cleanupProjectPolicies(projectId, endpoints);

    expect(mockedDocker.getContainer).not.toHaveBeenCalled();
  });

  it('tears down only this project\'s subnet networks, leaving unrelated networks alone', async () => {
    const networkHandle = {
      inspect: jest.fn().mockResolvedValue({ Containers: { c1: {}, c2: {} } }),
      disconnect: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    };
    (mockedDocker.listContainers as jest.Mock).mockResolvedValue([]);
    (mockedDocker.listNetworks as jest.Mock).mockResolvedValue([
      { Id: 'n1', Name: `akal-subnet-${projectId}-subnet-1` },
      { Id: 'n2', Name: 'akal-subnet-other-project-subnet-1' },
      { Id: 'n3', Name: 'akal-lab-network' }
    ]);
    (mockedDocker.getNetwork as jest.Mock).mockReturnValue(networkHandle);

    await provider.cleanupProjectPolicies(projectId, endpoints);

    expect(mockedDocker.getNetwork).toHaveBeenCalledTimes(1);
    expect(mockedDocker.getNetwork).toHaveBeenCalledWith('n1');
    expect(networkHandle.disconnect).toHaveBeenCalledWith({ Container: 'c1', Force: true });
    expect(networkHandle.disconnect).toHaveBeenCalledWith({ Container: 'c2', Force: true });
    expect(networkHandle.remove).toHaveBeenCalledTimes(1);
  });
});
