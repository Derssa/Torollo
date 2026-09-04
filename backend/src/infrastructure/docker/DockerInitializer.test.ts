import fs from 'fs';
import { DockerInitializer } from './DockerInitializer';
import docker from './DockerClient';
import { NODE_TYPES } from './nodeTypes';
import { getStartupState, resetStartupState } from './startupState';

jest.mock('fs');
jest.mock('./DockerClient', () => ({
  __esModule: true,
  default: {
    listNetworks: jest.fn(),
    getNetwork: jest.fn(),
    createNetwork: jest.fn(),
    info: jest.fn(),
    listImages: jest.fn(),
    createContainer: jest.fn(),
    getContainer: jest.fn(),
    getImage: jest.fn(),
    pull: jest.fn(),
    modem: { followProgress: jest.fn() }
  }
}));

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedDocker = docker as jest.Mocked<typeof docker>;

const ensureSharedNetwork = () => (DockerInitializer as any).ensureSharedNetwork();
const ensureHostForwarding = (rootless: boolean) => (DockerInitializer as any).ensureHostForwarding(rootless);
const detectRootless = () => (DockerInitializer as any).detectRootless();
const checkAndPullImages = () => (DockerInitializer as any).checkAndPullImages();

const ALL_NODE_TAGS = [
  NODE_TYPES.ubuntu.image,
  NODE_TYPES.postgres.image,
  NODE_TYPES.mongo.image,
  NODE_TYPES.redis.image,
  NODE_TYPES.rabbitmq.image
];

function mockImages(tags: string[]) {
  (mockedDocker.listImages as jest.Mock).mockResolvedValue(tags.map(tag => ({ RepoTags: [tag] })));
}

/** docker.pull(tag, opts, cb) followed by modem.followProgress(stream, onFinished). */
function mockPull(outcome: (tag: string) => Error | null) {
  (mockedDocker.pull as jest.Mock).mockImplementation((tag: string, _opts: unknown, cb: (err: Error | null, stream?: unknown) => void) => {
    cb(null, { tag });
  });
  (mockedDocker.modem.followProgress as jest.Mock).mockImplementation((stream: { tag: string }, onFinished: (err: Error | null) => void) => {
    onFinished(outcome(stream.tag));
  });
}

beforeEach(() => {
  resetStartupState();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

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

  it('accepts the versioned envelope format like the bare array', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    (mockedFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
      version: 1,
      projects: [{ id: 'project-1', networkConfig: { subnets: [{ id: 'subnet-1' }] } }]
    }));

    await ensureSharedNetwork();

    expect(mockedDocker.getNetwork).toHaveBeenCalledTimes(1);
    expect(mockedDocker.getNetwork).toHaveBeenCalledWith('n2');
    expect(networkHandle.remove).toHaveBeenCalledTimes(1);
  });

  it('skips cleanup on an unknown store version, and never moves the file aside', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    (mockedFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ version: 2, projects: [] }));

    await ensureSharedNetwork();

    expect(networkHandle.remove).not.toHaveBeenCalled();
    expect(mockedFs.renameSync).not.toHaveBeenCalled();
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

describe('DockerInitializer.detectRootless', () => {
  it('reads the rootless security option from docker info', async () => {
    (mockedDocker.info as jest.Mock).mockResolvedValue({ SecurityOptions: ['name=seccomp,profile=builtin', 'name=rootless'] });

    await expect(detectRootless()).resolves.toBe(true);
    expect(getStartupState().rootless).toBe(true);
  });

  it('is false on a regular daemon or when the field is missing', async () => {
    (mockedDocker.info as jest.Mock).mockResolvedValue({ SecurityOptions: ['name=seccomp,profile=builtin'] });
    await expect(detectRootless()).resolves.toBe(false);

    (mockedDocker.info as jest.Mock).mockResolvedValue({});
    await expect(detectRootless()).resolves.toBe(false);
    expect(getStartupState().rootless).toBe(false);
  });
});

describe('DockerInitializer.ensureHostForwarding', () => {
  const temp = { start: jest.fn(), wait: jest.fn(), remove: jest.fn() };
  const stale = { remove: jest.fn() };

  beforeEach(() => {
    temp.start.mockResolvedValue(undefined);
    temp.remove.mockResolvedValue(undefined);
    stale.remove.mockRejectedValue(new Error('no such container'));
    (mockedDocker.createContainer as jest.Mock).mockResolvedValue(temp);
    (mockedDocker.getContainer as jest.Mock).mockReturnValue(stale);
  });

  it('does not even try on rootless Docker and reports the engine as unsupported', async () => {
    await ensureHostForwarding(true);

    expect(mockedDocker.createContainer).not.toHaveBeenCalled();
    expect(getStartupState().hostForwarding).toEqual({ status: 'unsupported', reason: 'rootless' });
  });

  it('waits for the privileged container to exit cleanly, then removes it', async () => {
    temp.wait.mockResolvedValue({ StatusCode: 0 });

    await ensureHostForwarding(false);

    expect(mockedDocker.createContainer).toHaveBeenCalledWith(expect.objectContaining({
      Image: 'alpine',
      name: 'akal-lab-host-forwarding',
      HostConfig: { Privileged: true, NetworkMode: 'host' }
    }));
    expect(temp.wait).toHaveBeenCalled();
    expect(temp.remove).toHaveBeenCalledWith({ force: true });
    expect(getStartupState().hostForwarding).toEqual({ status: 'applied' });
  });

  it('reports a failure when the rules could not be applied, instead of claiming success', async () => {
    temp.wait.mockResolvedValue({ StatusCode: 2 });

    await ensureHostForwarding(false);

    expect(temp.remove).toHaveBeenCalledWith({ force: true });
    expect(getStartupState().hostForwarding).toEqual({ status: 'failed', reason: 'error' });
  });

  it('reports a failure when the container cannot be created at all', async () => {
    (mockedDocker.createContainer as jest.Mock).mockRejectedValue(new Error('no such image: alpine'));

    await ensureHostForwarding(false);

    expect(getStartupState().hostForwarding).toEqual({ status: 'failed', reason: 'error' });
  });
});

describe('DockerInitializer image preloading', () => {
  beforeEach(() => {
    mockedFs.existsSync.mockReturnValue(false);
    (mockedDocker.listNetworks as jest.Mock).mockResolvedValue([{ Id: 'n3', Name: 'akal-lab-network' }]);
    (mockedDocker.info as jest.Mock).mockResolvedValue({ SecurityOptions: ['name=rootless'] });
  });

  it('counts every preloaded image and leaves no current image once done', async () => {
    mockImages(ALL_NODE_TAGS);

    await checkAndPullImages();

    expect(mockedDocker.pull).not.toHaveBeenCalled();
    expect(getStartupState().images).toEqual({ total: 5, ready: 5, current: null });
  });

  it('pulls the missing images and reports which one is in flight', async () => {
    mockImages(ALL_NODE_TAGS.filter(tag => tag !== NODE_TYPES.ubuntu.image));
    const seen: Array<{ label: string; action: string } | null> = [];
    mockPull(() => {
      seen.push(getStartupState().images.current);
      return null;
    });

    await checkAndPullImages();

    expect(mockedDocker.pull).toHaveBeenCalledTimes(1);
    expect(mockedDocker.pull.mock.calls[0][0]).toBe(NODE_TYPES.ubuntu.image);
    expect(seen).toEqual([{ label: 'Ubuntu', action: 'pulling' }]);
    expect(getStartupState().images).toEqual({ total: 5, ready: 5, current: null });
  });

  it('marks the routine ready through initialize()', async () => {
    mockImages(ALL_NODE_TAGS);

    DockerInitializer.initialize();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    expect(getStartupState()).toMatchObject({ status: 'ready', rootless: true, hostForwarding: { status: 'unsupported' } });
  });

  it('marks the routine failed with the message when Docker cannot list images', async () => {
    (mockedDocker.listImages as jest.Mock).mockRejectedValue(Object.assign(new Error('connect ENOENT /var/run/docker.sock'), { code: 'ENOENT' }));

    await expect(checkAndPullImages()).rejects.toThrow('connect ENOENT');
  });
});

describe('DockerInitializer local image build', () => {
  const buildContainer = { start: jest.fn(), exec: jest.fn(), commit: jest.fn(), remove: jest.fn() };
  const exec = { start: jest.fn(), inspect: jest.fn() };
  const stale = { remove: jest.fn() };

  beforeEach(() => {
    buildContainer.start.mockResolvedValue(undefined);
    buildContainer.commit.mockResolvedValue(undefined);
    buildContainer.remove.mockResolvedValue(undefined);
    buildContainer.exec.mockResolvedValue(exec);
    exec.start.mockImplementation(async () => {
      const handlers: Record<string, () => void> = {};
      const stream = { on: (event: string, handler: () => void) => { handlers[event] = handler; return stream; } };
      setImmediate(() => handlers.end?.());
      return stream;
    });
    stale.remove.mockRejectedValue(new Error('no such container'));
    (mockedDocker.getContainer as jest.Mock).mockReturnValue(stale);
    (mockedDocker.createContainer as jest.Mock).mockResolvedValue(buildContainer);
  });

  it('rebuilds a custom image from its public base when the pull fails', async () => {
    mockImages(['redis:7-alpine']);
    mockPull(tag => (tag === NODE_TYPES.redis.image ? new Error('pull access denied') : null));
    exec.inspect.mockResolvedValue({ ExitCode: 0 });
    const actions: string[] = [];
    buildContainer.commit.mockImplementation(async () => {
      actions.push(getStartupState().images.current?.action ?? 'none');
    });

    await DockerInitializer.ensureImageAvailable(NODE_TYPES.redis.image);

    // The base is already local, so only the custom tag was attempted.
    expect(mockedDocker.pull).toHaveBeenCalledTimes(1);
    expect(mockedDocker.createContainer).toHaveBeenCalledWith(expect.objectContaining({
      Image: 'redis:7-alpine',
      name: 'akal-lab-temp-redis-build'
    }));
    expect(buildContainer.exec).toHaveBeenCalledWith(expect.objectContaining({
      Cmd: ['sh', '-c', 'apk update && apk add --no-cache iptables iproute2']
    }));
    expect(buildContainer.commit).toHaveBeenCalledWith({
      repo: 'derssa/backend-lab-redis',
      tag: 'v1',
      changes: ['ENTRYPOINT ["docker-entrypoint.sh"]', 'CMD ["redis-server"]']
    });
    expect(actions).toEqual(['building']);
    expect(buildContainer.remove).toHaveBeenCalledWith({ force: true });
  });

  it('pulls the public base first when it is not local either', async () => {
    mockImages([]);
    mockPull(tag => (tag === NODE_TYPES.rabbitmq.image ? new Error('pull access denied') : null));
    exec.inspect.mockResolvedValue({ ExitCode: 0 });

    await DockerInitializer.ensureImageAvailable(NODE_TYPES.rabbitmq.image);

    expect(mockedDocker.pull.mock.calls.map(call => call[0])).toEqual([NODE_TYPES.rabbitmq.image, 'rabbitmq:3-management-alpine']);
    expect(buildContainer.commit).toHaveBeenCalledWith(expect.objectContaining({ repo: 'derssa/backend-lab-rabbitmq' }));
  });

  it('fails loudly when iptables could not be installed, and still cleans up', async () => {
    mockImages(['mongo:latest']);
    mockPull(() => new Error('pull access denied'));
    exec.inspect.mockResolvedValue({ ExitCode: 100 });

    await expect(DockerInitializer.ensureImageAvailable(NODE_TYPES.mongo.image)).rejects.toThrow('exited with status 100');

    expect(buildContainer.commit).not.toHaveBeenCalled();
    expect(buildContainer.remove).toHaveBeenCalledWith({ force: true });
  });

  it('retags a local postgres base instead of building', async () => {
    mockImages(['postgres:15-alpine']);
    mockPull(() => new Error('pull access denied'));
    const image = { tag: jest.fn().mockResolvedValue(undefined) };
    (mockedDocker.getImage as jest.Mock).mockReturnValue(image);

    await DockerInitializer.ensureImageAvailable(NODE_TYPES.postgres.image);

    expect(mockedDocker.getImage).toHaveBeenCalledWith('postgres:15-alpine');
    expect(image.tag).toHaveBeenCalledWith({ repo: 'derssa/backend-lab-postgres', tag: 'v1' });
    expect(mockedDocker.createContainer).not.toHaveBeenCalled();
  });

  it('gives up on an image that has neither a fallback nor a local build recipe', async () => {
    mockImages([]);
    mockPull(() => new Error('pull access denied'));

    await expect(DockerInitializer.ensureImageAvailable(NODE_TYPES.ubuntu.image)).rejects.toThrow('pull access denied');
  });
});
