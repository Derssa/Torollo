import request from 'supertest';
import express from 'express';
import { ContainerController } from './containerController';
import { ContainerService } from '../services/containerService';
import { ProjectService } from '../../projects/services/projectService';
import { NetworkService } from '../../network/services/networkService';
import docker from '../../../infrastructure/docker/DockerClient';

// Mock Services
jest.mock('../services/containerService');
jest.mock('../../projects/services/projectService');
jest.mock('../../network/services/networkService');
jest.mock('../../../infrastructure/docker/DockerClient', () => ({
  __esModule: true,
  default: {
    getContainer: jest.fn()
  }
}));

const app = express();
app.use(express.json());

app.get('/api/projects/:projectId/containers', ContainerController.list);
app.post('/api/projects/:projectId/containers', ContainerController.create);
app.post('/api/containers/:id/start', ContainerController.start);
app.post('/api/containers/:id/stop', ContainerController.stop);
app.delete('/api/containers/:id', ContainerController.delete);
app.patch('/api/projects/:projectId/containers/:id/rename', ContainerController.rename);

describe('ContainerController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      expect(res.body).toEqual({ error: 'Docker error' });
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

  describe('PATCH /api/projects/:projectId/containers/:id/rename', () => {
    beforeEach(() => {
      (docker.getContainer as jest.Mock).mockReturnValue({
        inspect: jest.fn().mockResolvedValue({
          Config: {
            Labels: {
              'akal.project.id': 'test-project'
            }
          }
        })
      });
    });

    it('should rename a container successfully', async () => {
      (ContainerService.renameContainer as jest.Mock).mockResolvedValue(undefined);
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue({ some: 'config' });
      (NetworkService.applyPolicy as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .patch('/api/projects/test-project/containers/1/rename')
        .send({ newName: 'new-name' });

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

    it('should resolve the project from the container labels before renaming', async () => {
      (docker.getContainer as jest.Mock).mockReturnValue({
        inspect: jest.fn().mockResolvedValue({
          Config: {
            Labels: {
              'akal.project.id': 'resolved-project'
            }
          }
        })
      });
      (ContainerService.renameContainer as jest.Mock).mockResolvedValue(undefined);
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue({ some: 'config' });
      (NetworkService.applyPolicy as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .patch('/api/projects/wrong-project/containers/1/rename')
        .send({ newName: '  new-name  ' });

      expect(res.status).toBe(200);
      expect(ContainerService.renameContainer).toHaveBeenCalledWith('1', 'resolved-project', 'new-name');
      expect(ProjectService.getNetworkConfig).toHaveBeenCalledWith('resolved-project');
      expect(NetworkService.clearPolicyHash).toHaveBeenCalledWith('resolved-project');
      expect(NetworkService.applyPolicy).toHaveBeenCalledWith('resolved-project', { some: 'config' });
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
      expect(res.body).toEqual({ error: 'Unexpected error' });
    });
  });
});
