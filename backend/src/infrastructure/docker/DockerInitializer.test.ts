import fs from 'fs';
import { DockerInitializer } from './DockerInitializer';
import docker from './DockerClient';

jest.mock('fs');
jest.mock('./DockerClient', () => ({
  __esModule: true,
  default: {
    listNetworks: jest.fn(),
    getNetwork: jest.fn(),
    createNetwork: jest.fn()
  }
}));

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedDocker = docker as jest.Mocked<typeof docker>;

const ensureSharedNetwork = () => (DockerInitializer as any).ensureSharedNetwork();

describe('DockerInitializer.ensureSharedNetwork', () => {
  const networkHandle = {
    inspect: jest.fn(),
    disconnect: jest.fn(),
    remove: jest.fn()
  };

  beforeEach(() => {
    networkHandle.inspect.mockResolvedValue({ Containers: { c1: {} } });
    networkHandle.disconnect.mockResolvedValue(undefined);
    networkHandle.remove.mockResolvedValue(undefined);
    (mockedDocker.getNetwork as jest.Mock).mockReturnValue(networkHandle);
    (mockedDocker.listNetworks as jest.Mock).mockResolvedValue([
      { Id: 'n1', Name: 'akal-subnet-project-1-subnet-1' },
      { Id: 'n2', Name: 'akal-subnet-project-2-subnet-9' },
      { Id: 'n3', Name: 'akal-lab-network' }
    ]);
  });

  it('removes only subnet networks not referenced by any project', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    (mockedFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([
      { id: 'project-1', networkConfig: { subnets: [{ id: 'subnet-1' }] } }
    ]));

    await ensureSharedNetwork();

    expect(mockedDocker.getNetwork).toHaveBeenCalledTimes(1);
    expect(mockedDocker.getNetwork).toHaveBeenCalledWith('n2');
    expect(networkHandle.disconnect).toHaveBeenCalledWith({ Container: 'c1', Force: true });
    expect(networkHandle.remove).toHaveBeenCalledTimes(1);
    expect(mockedDocker.createNetwork).not.toHaveBeenCalled();
  });

  it('skips cleanup entirely when projects.json is corrupt, but still ensures the shared network', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    (mockedFs.readFileSync as jest.Mock).mockReturnValue('{ not valid json');
    (mockedDocker.listNetworks as jest.Mock).mockResolvedValue([
      { Id: 'n1', Name: 'akal-subnet-project-1-subnet-1' }
    ]);

    await ensureSharedNetwork();

    expect(networkHandle.remove).not.toHaveBeenCalled();
    expect(networkHandle.disconnect).not.toHaveBeenCalled();
    expect(mockedDocker.createNetwork).toHaveBeenCalledWith({
      Name: 'akal-lab-network',
      Driver: 'bridge'
    });
  });

  it('skips cleanup when projects.json is not an array', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    (mockedFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({}));

    await ensureSharedNetwork();

    expect(networkHandle.remove).not.toHaveBeenCalled();
  });

  it('treats all subnet networks as orphaned when projects.json does not exist', async () => {
    mockedFs.existsSync.mockReturnValue(false);

    await ensureSharedNetwork();

    expect(networkHandle.remove).toHaveBeenCalledTimes(2);
  });
});
