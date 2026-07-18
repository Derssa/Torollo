import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { PassThrough } from 'stream';
import { TerminalGateway } from './terminalGateway';
import { TerminalManager } from '../../../infrastructure/docker/TerminalManager';
import { ContainerService } from '../../containers/services/containerService';
import { ContainerNotFoundError } from '../../../infrastructure/docker/dockerErrors';

jest.mock('../../../infrastructure/docker/TerminalManager');
jest.mock('../../containers/services/containerService');

describe('TerminalGateway', () => {
  let httpServer: HttpServer;
  let io: Server;
  let client: ClientSocket;
  let port: number;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer);
    TerminalGateway.handleConnections(io);
    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    // io.close() also closes the underlying HTTP server.
    io.close(() => done());
  });

  beforeEach((done) => {
    jest.clearAllMocks();
    client = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    client.on('connect', done);
  });

  afterEach(() => {
    client.disconnect();
  });

  function nextOutput(): Promise<string> {
    return new Promise((resolve) => client.once('terminal-output', resolve));
  }

  it('refuses a container that does not belong to the project and never opens a session', async () => {
    (ContainerService.assertContainerInProject as jest.Mock).mockRejectedValue(new ContainerNotFoundError('foreign'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const output = nextOutput();
    client.emit('join-terminal', { containerId: 'foreign', projectId: 'project-a' });

    expect(await output).toContain('Error starting terminal');
    expect(ContainerService.assertContainerInProject).toHaveBeenCalledWith('foreign', 'project-a');
    expect(TerminalManager.createTerminalSession).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not leak the raw error and answers like a missing container', async () => {
    (ContainerService.assertContainerInProject as jest.Mock).mockRejectedValue(new ContainerNotFoundError('foreign'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const output = nextOutput();
    client.emit('join-terminal', { containerId: 'foreign', projectId: 'project-a' });

    expect(await output).toContain('This container no longer exists in Docker');
    consoleError.mockRestore();
  });

  it('opens a session and relays its output when the container belongs to the project', async () => {
    (ContainerService.assertContainerInProject as jest.Mock).mockResolvedValue(undefined);
    const stream = new PassThrough();
    (TerminalManager.createTerminalSession as jest.Mock).mockResolvedValue({ stream, exec: {} });

    const output = nextOutput();
    client.emit('join-terminal', { containerId: 'legit', projectId: 'project-a' });

    // Wait until the session is wired before writing to the stream.
    await new Promise<void>((resolve) => {
      const check = () => ((TerminalManager.createTerminalSession as jest.Mock).mock.calls.length ? resolve() : setTimeout(check, 10));
      check();
    });
    await new Promise((r) => setTimeout(r, 50));
    stream.write('root@container:/# ');

    expect(await output).toContain('root@container:/# ');
    expect(ContainerService.assertContainerInProject).toHaveBeenCalledWith('legit', 'project-a');
    expect(TerminalManager.createTerminalSession).toHaveBeenCalledWith('legit');
  });

  it('refuses a payload without projectId (fail closed)', async () => {
    (ContainerService.assertContainerInProject as jest.Mock).mockRejectedValue(new ContainerNotFoundError('c1'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const output = nextOutput();
    client.emit('join-terminal', { containerId: 'c1' });

    expect(await output).toContain('Error starting terminal');
    expect(ContainerService.assertContainerInProject).toHaveBeenCalledWith('c1', undefined);
    expect(TerminalManager.createTerminalSession).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
