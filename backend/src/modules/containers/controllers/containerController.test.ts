import request from 'supertest';
import express from 'express';
import { ContainerController } from './containerController';
import { requireContainerOwnership } from '../middleware/containerOwnership';
import { ContainerService } from '../services/containerService';
import { ProjectService } from '../../projects/services/projectService';
import { NetworkService } from '../../network/services/networkService';
import { ContainerNotFoundError } from '../../../infrastructure/docker/dockerErrors';

// Mock Services
jest.mock('../services/containerService');
jest.mock('../../projects/services/projectService');
jest.mock('../../network/services/networkService');

const app = express();
app.use(express.json());

app.get('/api/projects/:projectId/containers', ContainerController.list);
app.post('/api/projects/:projectId/containers', ContainerController.create);
app.post('/api/projects/:projectId/containers/:id/start', requireContainerOwnership, ContainerController.start);
app.post('/api/projects/:projectId/containers/:id/stop', requireContainerOwnership, ContainerController.stop);
app.delete('/api/projects/:projectId/containers/:id', requireContainerOwnership, ContainerController.delete);
app.patch('/api/projects/:projectId/containers/:id/rename', requireContainerOwnership, ContainerController.rename);
app.get('/api/projects/:projectId/containers/:id/postgres/explorer', requireContainerOwnership, ContainerController.postgresExplorer);

describe('ContainerController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The ownership guard passes by default; denial cases override this.
    (ContainerService.assertContainerInProject as jest.Mock).mockResolvedValue(undefined);
  });

  describe('GET /api/projects/:projectId/containers', () => {
    it('should return a list of containers', async () => {
      const mockContainers = [
        { id: '1', name: 'ubuntu-1', image: 'ubuntu', state: 'running', status: 'up' }
      ];
      (ContainerService.listContainers as jest.Mock).mockResolvedValue(mockContainers);

      const res = await request(app).get('/api/projects/test-project/containers');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockContainers);
      expect(ContainerService.listContainers).toHaveBeenCalledWith('test-project');
    });

    it('should handle errors cleanly and return 500 status', async () => {
      (ContainerService.listContainers as jest.Mock).mockRejectedValue(new Error('Docker error'));

      const res = await request(app).get('/api/projects/test-project/containers');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Docker error', code: 'DOCKER_ERROR' });
    });
  });

  describe('POST /api/projects/:projectId/containers', () => {
    it('should create a container and trigger network policy re-application', async () => {
      const mockContainer = { id: '1', name: 'ubuntu-1', image: 'ubuntu', state: 'running', status: 'up' };
      (ContainerService.createContainer as jest.Mock).mockResolvedValue(mockContainer);
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue({ some: 'config' });
      (NetworkService.applyPolicy as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/projects/test-project/containers')
        .send({ name: 'ubuntu-1', type: 'ubuntu' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockContainer);
      expect(ContainerService.createContainer).toHaveBeenCalledWith('test-project', 'ubuntu-1', 'ubuntu', false);
      expect(ProjectService.getNetworkConfig).toHaveBeenCalledWith('test-project');
      expect(NetworkService.clearPolicyHash).toHaveBeenCalledWith('test-project');
      expect(NetworkService.applyPolicy).toHaveBeenCalledWith('test-project', { some: 'config' });
    });

    it('should return 400 if name is missing', async () => {
      const res = await request(app)
        .post('/api/projects/test-project/containers')
        .send({ type: 'ubuntu' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Name is required' });
    });
  });

  describe('container ownership guard', () => {
    beforeEach(() => {
      (ContainerService.assertContainerInProject as jest.Mock).mockRejectedValue(new ContainerNotFoundError('1'));
    });

    it.each([
      ['start', () => request(app).post('/api/projects/test-project/containers/1/start'), () => ContainerService.startContainer],
      ['stop', () => request(app).post('/api/projects/test-project/containers/1/stop'), () => ContainerService.stopContainer],
      ['delete', () => request(app).delete('/api/projects/test-project/containers/1'), () => ContainerService.deleteContainer],
      ['rename', () => request(app).patch('/api/projects/test-project/containers/1/rename').send({ newName: 'x' }), () => ContainerService.renameContainer],
      ['postgres explorer', () => request(app).get('/api/projects/test-project/containers/1/postgres/explorer'), () => ContainerService.getPostgresExplorer],
    ])('answers 404 CONTAINER_NOT_FOUND on %s and never reaches the service', async (_op, doRequest, service) => {
      const res = await doRequest();

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CONTAINER_NOT_FOUND');
      expect(ContainerService.assertContainerInProject).toHaveBeenCalledWith('1', 'test-project');
      expect(service()).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/projects/:projectId/containers/:id/start', () => {
    it('should start the container and re-apply the network policy of the URL project', async () => {
      (ContainerService.startContainer as jest.Mock).mockResolvedValue(undefined);
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue({ some: 'config' });
      (NetworkService.applyPolicy as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app).post('/api/projects/test-project/containers/1/start');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(ContainerService.assertContainerInProject).toHaveBeenCalledWith('1', 'test-project');
      expect(ContainerService.startContainer).toHaveBeenCalledWith('1');
      expect(ProjectService.getNetworkConfig).toHaveBeenCalledWith('test-project');
      expect(NetworkService.clearPolicyHash).toHaveBeenCalledWith('test-project');
      expect(NetworkService.applyPolicy).toHaveBeenCalledWith('test-project', { some: 'config' });
    });
  });

  describe('PATCH /api/projects/:projectId/containers/:id/rename', () => {
    it('should rename a container successfully', async () => {
      (ContainerService.renameContainer as jest.Mock).mockResolvedValue(undefined);
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue({ some: 'config' });
      (NetworkService.applyPolicy as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .patch('/api/projects/test-project/containers/1/rename')
        .send({ newName: '  new-name  ' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(ContainerService.renameContainer).toHaveBeenCalledWith('1', 'test-project', 'new-name');
      expect(ProjectService.getNetworkConfig).toHaveBeenCalledWith('test-project');
      expect(NetworkService.clearPolicyHash).toHaveBeenCalledWith('test-project');
      expect(NetworkService.applyPolicy).toHaveBeenCalledWith('test-project', { some: 'config' });
    });

    it('should return 400 if newName is missing', async () => {
      const res = await request(app)
        .patch('/api/projects/test-project/containers/1/rename')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'newName is required' });
    });

    it('should return 400 if newName is blank', async () => {
      const res = await request(app)
        .patch('/api/projects/test-project/containers/1/rename')
        .send({ newName: '   ' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'newName is required' });
    });

    it('should handle the same-name error gracefully by returning success', async () => {
      (ContainerService.renameContainer as jest.Mock).mockRejectedValue(
        new Error('Renaming a container with the same name as its current name')
      );

      const res = await request(app)
        .patch('/api/projects/test-project/containers/1/rename')
        .send({ newName: 'same-name' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, message: 'Container already has the same name.' });
    });

    it('should return 500 on unexpected service errors', async () => {
      (ContainerService.renameContainer as jest.Mock).mockRejectedValue(new Error('Unexpected error'));

      const res = await request(app)
        .patch('/api/projects/test-project/containers/1/rename')
        .send({ newName: 'other-name' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Unexpected error', code: 'DOCKER_ERROR' });
    });
  });

  describe('Docker error classification', () => {
    it('should return 503 DOCKER_UNAVAILABLE when the Docker daemon is unreachable on start', async () => {
      (ContainerService.startContainer as jest.Mock).mockRejectedValue(
        Object.assign(new Error('connect ECONNREFUSED /var/run/docker.sock'), { code: 'ECONNREFUSED' })
      );

      const res = await request(app).post('/api/projects/test-project/containers/1/start');

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('DOCKER_UNAVAILABLE');
      expect(res.body.error).toContain('Docker daemon');
    });

    it('should return 502 IMAGE_NOT_FOUND when the image pull fails on create', async () => {
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue(null);
      (ContainerService.createContainer as jest.Mock).mockRejectedValue(
        new Error('pull access denied for ghost, repository does not exist')
      );

      const res = await request(app)
        .post('/api/projects/test-project/containers')
        .send({ name: 'ghost-1', type: 'ubuntu' });

      expect(res.status).toBe(502);
      expect(res.body.code).toBe('IMAGE_NOT_FOUND');
      expect(res.body.error).toContain('image');
    });

    it('should return 409 PORT_IN_USE when a host port is already taken on create', async () => {
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue(null);
      (ContainerService.createContainer as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Bind for 0.0.0.0:8080 failed: port is already allocated'), { statusCode: 500 })
      );

      const res = await request(app)
        .post('/api/projects/test-project/containers')
        .send({ name: 'web-1', type: 'ubuntu' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PORT_IN_USE');
      expect(res.body.error).toContain('port');
    });

    it('should treat a 304 (already started) as a successful no-op', async () => {
      (ContainerService.startContainer as jest.Mock).mockRejectedValue(
        Object.assign(new Error('container already started'), { statusCode: 304 })
      );

      const res = await request(app).post('/api/projects/test-project/containers/1/start');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });
  });
});
