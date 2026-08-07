import { PassThrough } from 'stream';
import docker from './DockerClient';
import { TerminalManager } from './TerminalManager';

jest.mock('./DockerClient', () => ({
  __esModule: true,
  default: {
    getContainer: jest.fn()
  }
}));

const mockedDocker = docker as jest.Mocked<typeof docker>;

describe('TerminalManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts an interactive exec as a raw TTY stream', async () => {
    const stream = new PassThrough();
    const start = jest.fn((_options, callback) => callback(null, stream));
    const exec = { start };
    const createExec = jest.fn().mockResolvedValue(exec);
    (mockedDocker.getContainer as jest.Mock).mockReturnValue({ exec: createExec });

    const session = await TerminalManager.createTerminalSession('container-1');

    expect(createExec).toHaveBeenCalledWith({
      Cmd: ['/bin/bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true
    });
    expect(start).toHaveBeenCalledWith(
      { hijack: true, stdin: true, Tty: true },
      expect.any(Function)
    );
    expect(session).toEqual({ stream, exec });
  });
});
