import { createServer } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import request from 'supertest';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import docker from '../../infrastructure/docker/DockerClient';
import { containerProvider } from '../../infrastructure/docker/providers/dockerContainerProvider';
import { resolveNodeType } from '../../infrastructure/docker/nodeTypes';
import { ProjectService } from '../projects/services/projectService';
import containerRouter from './routes/containerRoutes';
import { TerminalGateway } from '../terminal/gateway/terminalGateway';

/**
 * Integration tests (run with `npm run test:integration`, requires a Docker daemon).
 *
 * Proves the container-ownership rule against reality: a container is only
 * reachable through the API and the terminal gateway when it carries the
 * `akal.project.id` label of the project in the request. Three fixtures:
 * - project A with its own containers (must stay fully operable),
 * - project B (its containers must be invisible through A's URLs),
 * - a "rogue" container created outside the app, without any akal label
 *   (must be invisible everywhere, and untouched by refused operations).
 */

/**
 * `containerProvider.createContainer` attaches every container to this network
 * (`HostConfig.NetworkMode: 'akal-lab-network'`). In the running app it's created
 * once at server startup (`DockerInitializer.ensureSharedNetwork`), but this suite
 * never boots the server, so a fresh Docker daemon (e.g. a CI runner) won't have it.
 */
async function ensureSharedNetwork(): Promise<void> {
  const networks = await docker.listNetworks();
  if (!networks.some((n) => n.Name === 'akal-lab-network')) {
    await docker.createNetwork({ Name: 'akal-lab-network', Driver: 'bridge' });
  }
}

async function waitUntilReady(check: () => Promise<string>, label: string): Promise<void> {
  const deadline = Date.now() + 60000;
  let lastOutput = '';
  while (Date.now() < deadline) {
    lastOutput = await check();
    if (!lastOutput.startsWith('ERROR')) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not become ready in time (last output: ${lastOutput})`);
}

describe('container ownership — real containers', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects/:projectId/containers', containerRouter);

  let projectAId = '';
  let projectBId = '';
  let appContainerId = '';
  let dbContainerId = '';
  let foreignContainerId = '';
  let rogueContainerId = '';

  beforeAll(async () => {
    try {
      await docker.ping();
    } catch {
      throw new Error(
        'Docker daemon is not reachable. Integration tests require a running Docker daemon.'
      );
    }

    await ensureSharedNetwork();

    const projectA = await ProjectService.createProject('s2-ownership-fixture-a');
    projectAId = projectA.id;
    const projectB = await ProjectService.createProject('s2-ownership-fixture-b');
    projectBId = projectB.id;

    const appContainer = await containerProvider.createContainer(projectAId, 'app', 'ubuntu');
    appContainerId = appContainer.id;
    const db = await containerProvider.createContainer(projectAId, 'db', 'postgres');
    dbContainerId = db.id;
    const foreign = await containerProvider.createContainer(projectBId, 'other', 'ubuntu');
    foreignContainerId = foreign.id;

    // A container launched by hand, outside the app: same image (already pulled
    // above), no akal label at all. A leftover from an aborted previous run
    // would make createContainer fail on the name conflict — clear it first.
    try {
      await docker.getContainer('s2-rogue-container').remove({ force: true });
    } catch {
      // no leftover
    }
    const rogue = await docker.createContainer({
      Image: resolveNodeType('ubuntu').image,
      name: 's2-rogue-container',
      Cmd: ['sleep', 'infinity'],
    });
    rogueContainerId = rogue.id;
    await rogue.start();

    await waitUntilReady(
      () => containerProvider.executePsqlCommand(dbContainerId, 'postgres', 'SELECT 1;'),
      'PostgreSQL'
    );
  });

  afterAll(async () => {
    try {
      await docker.getContainer(rogueContainerId).remove({ force: true });
    } catch {
      // already gone
    }
    if (projectAId) await ProjectService.deleteProject(projectAId);
    if (projectBId) await ProjectService.deleteProject(projectBId);
  });

  describe('a container launched outside the app is unreachable', () => {
    it.each([
      ['start', () => request(app).post(`/api/projects/${projectAId}/containers/${rogueContainerId}/start`)],
      ['stop', () => request(app).post(`/api/projects/${projectAId}/containers/${rogueContainerId}/stop`)],
      ['rename', () => request(app).patch(`/api/projects/${projectAId}/containers/${rogueContainerId}/rename`).send({ newName: 'stolen' })],
      ['scale', () => request(app).post(`/api/projects/${projectAId}/containers/${rogueContainerId}/scale`).send({ cpus: 1 })],
      ['postgres explorer', () => request(app).get(`/api/projects/${projectAId}/containers/${rogueContainerId}/postgres/explorer`)],
      ['redis query', () => request(app).post(`/api/projects/${projectAId}/containers/${rogueContainerId}/redis/query`).send({ query: 'KEYS *' })],
      ['nosql explorer', () => request(app).get(`/api/projects/${projectAId}/containers/${rogueContainerId}/nosql/explorer`)],
      ['delete', () => request(app).delete(`/api/projects/${projectAId}/containers/${rogueContainerId}`)],
    ])('%s answers 404 CONTAINER_NOT_FOUND', async (_op, doRequest) => {
      const res = await doRequest();
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CONTAINER_NOT_FOUND');
    });

    it('left the rogue container untouched by the refused stop/delete', async () => {
      const info = await docker.getContainer(rogueContainerId).inspect();
      expect(info.State.Running).toBe(true);
      expect(info.Name).toContain('s2-rogue-container');
    });
  });

  describe("another project's container is invisible through this project's URLs", () => {
    it.each([
      ['start', () => request(app).post(`/api/projects/${projectAId}/containers/${foreignContainerId}/start`)],
      ['postgres explorer', () => request(app).get(`/api/projects/${projectAId}/containers/${foreignContainerId}/postgres/explorer`)],
      ['delete', () => request(app).delete(`/api/projects/${projectAId}/containers/${foreignContainerId}`)],
    ])('%s answers 404 CONTAINER_NOT_FOUND', async (_op, doRequest) => {
      const res = await doRequest();
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CONTAINER_NOT_FOUND');
    });

    it("left project B's container running", async () => {
      const info = await docker.getContainer(foreignContainerId).inspect();
      expect(info.State.Running).toBe(true);
    });
  });

  describe("the project's own containers stay fully operable", () => {
    it('stops, renames and restarts a project container', async () => {
      const stop = await request(app).post(`/api/projects/${projectAId}/containers/${appContainerId}/stop`);
      expect(stop.status).toBe(200);
      expect(stop.body).toEqual({ success: true });

      const rename = await request(app)
        .patch(`/api/projects/${projectAId}/containers/${appContainerId}/rename`)
        .send({ newName: 'app-renamed' });
      expect(rename.status).toBe(200);
      expect(rename.body.success).toBe(true);

      const start = await request(app).post(`/api/projects/${projectAId}/containers/${appContainerId}/start`);
      expect(start.status).toBe(200);
      expect(start.body).toEqual({ success: true });

      const info = await docker.getContainer(appContainerId).inspect();
      expect(info.State.Running).toBe(true);
      expect(info.Name).toContain('app-renamed');
    });

    it('serves the postgres explorer of a project container', async () => {
      const res = await request(app).get(`/api/projects/${projectAId}/containers/${dbContainerId}/postgres/explorer`);
      expect(res.status).toBe(200);
      expect(res.body.map((entry: { database: string }) => entry.database)).toEqual(
        expect.arrayContaining(['postgres'])
      );
    });
  });

  describe('terminal gateway', () => {
    let io: Server;
    let port = 0;
    let client: ClientSocket | null = null;

    beforeAll((done) => {
      const httpServer = createServer();
      io = new Server(httpServer);
      TerminalGateway.handleConnections(io);
      httpServer.listen(() => {
        port = (httpServer.address() as AddressInfo).port;
        done();
      });
    });

    afterAll((done) => {
      io.close(() => done());
    });

    afterEach(() => {
      client?.disconnect();
      client = null;
    });

    function joinAndWaitForOutput(containerId: string, projectId: string): Promise<string> {
      return new Promise((resolve) => {
        client = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
        client.on('connect', () => {
          client!.once('terminal-output', resolve);
          client!.emit('join-terminal', { containerId, projectId });
        });
      });
    }

    it('refuses a shell into the rogue container and creates no exec', async () => {
      const output = await joinAndWaitForOutput(rogueContainerId, projectAId);
      expect(output).toContain('Error starting terminal');

      const info = await docker.getContainer(rogueContainerId).inspect();
      expect(info.ExecIDs ?? []).toHaveLength(0);
    });

    it("opens a shell into the project's own container", async () => {
      const output = await joinAndWaitForOutput(appContainerId, projectAId);
      expect(output).not.toContain('Error starting terminal');
      expect(output.length).toBeGreaterThan(0);
    });
  });
});
