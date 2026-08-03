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
    createNetwork: jest.fn(),
    createContainer: jest.fn()
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

const GATEWAY_MODE_OPTIONS = { 'com.docker.network.bridge.gateway_mode_ipv4': 'nat-unprotected' };

describe('DockerNetworkProvider.ensureNetwork', () => {
  const provider = new DockerNetworkProvider();
  const ensureNetwork = (netName: string, cidr: string, allNetworks: any[]) =>
    (provider as any).ensureNetwork(netName, cidr, allNetworks);

  beforeEach(() => {
    (DockerNetworkProvider as any).gatewayModeUnsupported = false;
  });

  it('creates the network with the requested CIDR and the unprotected gateway mode when it does not exist yet', async () => {
    (mockedDocker.createNetwork as jest.Mock).mockResolvedValue(undefined);

    const result = await ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', []);

    expect(result).toBe('10.0.1.0/24');
    expect(mockedDocker.createNetwork).toHaveBeenCalledWith({
      Name: 'akal-subnet-p1-s1',
      Driver: 'bridge',
      IPAM: { Config: [{ Subnet: '10.0.1.0/24', Gateway: '10.0.1.1' }] },
      Options: GATEWAY_MODE_OPTIONS
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
      IPAM: { Config: [{ Subnet: '10.112.1.0/24', Gateway: '10.112.1.1' }] },
      Options: GATEWAY_MODE_OPTIONS
    });
  });

  it('gives up after 10 failed attempts due to persistent overlap', async () => {
    (mockedDocker.createNetwork as jest.Mock).mockRejectedValue(new Error('overlaps'));

    await expect(ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', [])).rejects.toThrow(
      'Failed to create network akal-subnet-p1-s1 after 10 attempts due to address space overlaps.'
    );
    expect(mockedDocker.createNetwork).toHaveBeenCalledTimes(10);
  });

  it('drops the gateway-mode option when the daemon rejects it, and stops offering it once that fallback succeeds', async () => {
    (mockedDocker.createNetwork as jest.Mock)
      .mockRejectedValueOnce(new Error('invalid option: com.docker.network.bridge.gateway_mode_ipv4'))
      .mockResolvedValue(undefined);

    const result = await ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', []);

    expect(result).toBe('10.0.1.0/24');
    expect(mockedDocker.createNetwork).toHaveBeenCalledTimes(2);
    expect((mockedDocker.createNetwork as jest.Mock).mock.calls[1][0].Options).toBeUndefined();

    // Next create must not offer the option again for this process.
    await ensureNetwork('akal-subnet-p1-s2', '10.0.2.0/24', []);
    expect((mockedDocker.createNetwork as jest.Mock).mock.calls[2][0].Options).toBeUndefined();
  });

  it('rethrows persistent non-overlap errors after the option fallback, without flagging the option unsupported', async () => {
    (mockedDocker.createNetwork as jest.Mock).mockRejectedValue(new Error('permission denied'));

    await expect(ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', [])).rejects.toThrow('permission denied');
    // One attempt with the option, one without: the error is not about the option.
    expect(mockedDocker.createNetwork).toHaveBeenCalledTimes(2);
    expect((DockerNetworkProvider as any).gatewayModeUnsupported).toBe(false);
  });

  it('reuses an already-created network carrying the gateway mode and returns its actual subnet', async () => {
    const networkHandle = {
      inspect: jest.fn().mockResolvedValue({
        IPAM: { Config: [{ Subnet: '10.99.1.0/24' }] },
        Options: GATEWAY_MODE_OPTIONS
      })
    };
    (mockedDocker.getNetwork as jest.Mock).mockReturnValue(networkHandle);

    const result = await ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', [{ Name: 'akal-subnet-p1-s1' }]);

    expect(result).toBe('10.99.1.0/24');
    expect(mockedDocker.createNetwork).not.toHaveBeenCalled();
  });

  it('recreates an existing network that predates the gateway-mode option, keeping its resolved CIDR', async () => {
    const networkHandle = {
      inspect: jest.fn().mockResolvedValue({
        IPAM: { Config: [{ Subnet: '10.112.1.0/24' }] },
        Containers: { c1: {}, c2: {} }
      }),
      disconnect: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    };
    (mockedDocker.getNetwork as jest.Mock).mockReturnValue(networkHandle);
    (mockedDocker.createNetwork as jest.Mock).mockResolvedValue(undefined);

    const result = await ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', [{ Name: 'akal-subnet-p1-s1' }]);

    expect(result).toBe('10.112.1.0/24');
    expect(networkHandle.disconnect).toHaveBeenCalledWith({ Container: 'c1', Force: true });
    expect(networkHandle.disconnect).toHaveBeenCalledWith({ Container: 'c2', Force: true });
    expect(networkHandle.remove).toHaveBeenCalledTimes(1);
    expect(mockedDocker.createNetwork).toHaveBeenCalledWith({
      Name: 'akal-subnet-p1-s1',
      Driver: 'bridge',
      IPAM: { Config: [{ Subnet: '10.112.1.0/24', Gateway: '10.112.1.1' }] },
      Options: GATEWAY_MODE_OPTIONS
    });
  });

  it('keeps the existing network as a degraded fallback when its removal for recreation fails', async () => {
    const networkHandle = {
      inspect: jest.fn().mockResolvedValue({ IPAM: { Config: [{ Subnet: '10.99.1.0/24' }] } }),
      disconnect: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockRejectedValue(new Error('network has active endpoints'))
    };
    (mockedDocker.getNetwork as jest.Mock).mockReturnValue(networkHandle);

    const result = await ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', [{ Name: 'akal-subnet-p1-s1' }]);

    expect(result).toBe('10.99.1.0/24');
    expect(mockedDocker.createNetwork).not.toHaveBeenCalled();
  });

  it('does not recreate pre-existing networks once the daemon is known to reject the option', async () => {
    (DockerNetworkProvider as any).gatewayModeUnsupported = true;
    const networkHandle = {
      inspect: jest.fn().mockResolvedValue({ IPAM: { Config: [{ Subnet: '10.99.1.0/24' }] } }),
      remove: jest.fn()
    };
    (mockedDocker.getNetwork as jest.Mock).mockReturnValue(networkHandle);

    const result = await ensureNetwork('akal-subnet-p1-s1', '10.0.1.0/24', [{ Name: 'akal-subnet-p1-s1' }]);

    expect(result).toBe('10.99.1.0/24');
    expect(networkHandle.remove).not.toHaveBeenCalled();
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

describe('DockerNetworkProvider.probeInterSubnetConnectivity', () => {
  const { getInterSubnetStatus, setInterSubnetStatus, clearInterSubnetStatus } =
    jest.requireActual('../services/interSubnetHealth');

  const makeProvider = () => new DockerNetworkProvider();
  const probe = (provider: DockerNetworkProvider, projectId: string, config: any, resolvedCidrs: Record<string, string>) =>
    (provider as any).probeInterSubnetConnectivity(projectId, config, resolvedCidrs);

  /** Fake listener+prober containers: the prober exits with the given code. */
  function mockProbeContainers(proberExitCode: number) {
    const listener = {
      start: jest.fn().mockResolvedValue(undefined),
      inspect: jest.fn().mockResolvedValue({
        NetworkSettings: { Networks: { 'akal-subnet-p1-s1': { IPAddress: '10.0.1.5' } } }
      }),
      remove: jest.fn().mockResolvedValue(undefined)
    };
    const prober = {
      start: jest.fn().mockResolvedValue(undefined),
      wait: jest.fn().mockResolvedValue({ StatusCode: proberExitCode }),
      remove: jest.fn().mockResolvedValue(undefined)
    };
    (mockedDocker.createContainer as jest.Mock)
      .mockResolvedValueOnce(listener)
      .mockResolvedValueOnce(prober);
    return { listener, prober };
  }

  const twoSubnetConfig = { subnets: [{ id: 's1' }, { id: 's2' }] };
  const twoSubnetCidrs = { s1: '10.0.1.0/24', s2: '10.0.2.0/24' };

  beforeEach(() => {
    clearInterSubnetStatus('p1');
  });

  it('clears any recorded status when the project has fewer than two subnet networks', async () => {
    setInterSubnetStatus('p1', 'blocked');

    await probe(makeProvider(), 'p1', { subnets: [{ id: 's1' }] }, { s1: '10.0.1.0/24' });

    expect(getInterSubnetStatus('p1')).toBe('unknown');
    expect(mockedDocker.createContainer).not.toHaveBeenCalled();
  });

  it('records ok when the prober reaches the listener across subnets, and cleans both containers up', async () => {
    const { listener, prober } = mockProbeContainers(0);

    await probe(makeProvider(), 'p1', twoSubnetConfig, twoSubnetCidrs);

    expect(getInterSubnetStatus('p1')).toBe('ok');
    expect(listener.remove).toHaveBeenCalledWith({ force: true });
    expect(prober.remove).toHaveBeenCalledWith({ force: true });
  });

  it('records blocked when the prober cannot cross, and skips re-probing the same network set', async () => {
    mockProbeContainers(1);
    const provider = makeProvider();

    await probe(provider, 'p1', twoSubnetConfig, twoSubnetCidrs);
    expect(getInterSubnetStatus('p1')).toBe('blocked');
    expect(mockedDocker.createContainer).toHaveBeenCalledTimes(2);

    await probe(provider, 'p1', twoSubnetConfig, twoSubnetCidrs);
    expect(mockedDocker.createContainer).toHaveBeenCalledTimes(2);
  });

  it('records unknown (never blocked) when the probe infrastructure itself fails', async () => {
    (mockedDocker.createContainer as jest.Mock).mockRejectedValue(new Error('image not found'));

    await probe(makeProvider(), 'p1', twoSubnetConfig, twoSubnetCidrs);

    expect(getInterSubnetStatus('p1')).toBe('unknown');
  });
});
