import request from 'supertest';
import express from 'express';
import { ProjectController } from './projectController';
import { ProjectService } from '../services/projectService';
import { NetworkService } from '../../network/services/networkService';

// Mock Services
jest.mock('../services/projectService');
jest.mock('../../network/services/networkService');

const app = express();
app.use(express.json());

app.get('/api/projects', ProjectController.list);
app.post('/api/projects', ProjectController.create);
app.delete('/api/projects/:id', ProjectController.delete);
app.get('/api/projects/:id/network-config', ProjectController.getNetworkConfig);
app.post('/api/projects/:id/network-config', ProjectController.saveNetworkConfig);

describe('ProjectController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/projects', () => {
    it('should return a list of projects', async () => {
      const mockProjects = [
        { id: 'project-1', name: 'Project 1', createdAt: '2026-07-11T12:00:00.000Z' }
      ];
      (ProjectService.listProjects as jest.Mock).mockResolvedValue(mockProjects);
      (ProjectService.consumeStoreRecovered as jest.Mock).mockReturnValue(false);

      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ projects: mockProjects });
      expect(ProjectService.listProjects).toHaveBeenCalled();
    });

    it('should surface the one-shot store recovery notice', async () => {
      (ProjectService.listProjects as jest.Mock).mockResolvedValue([]);
      (ProjectService.consumeStoreRecovered as jest.Mock).mockReturnValue(true);

      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ projects: [], storeRecovered: true });
    });

    it('should handle errors and return 500 status', async () => {
      (ProjectService.listProjects as jest.Mock).mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'DB error' });
    });
  });

  describe('POST /api/projects', () => {
    it('should create a project successfully when the name is unique', async () => {
      const mockProject = { id: 'project-1', name: 'Project 1', createdAt: '2026-07-11T12:00:00.000Z' };
      (ProjectService.listProjects as jest.Mock).mockResolvedValue([]);
      (ProjectService.createProject as jest.Mock).mockResolvedValue(mockProject);

      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Project 1' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockProject);
      expect(ProjectService.createProject).toHaveBeenCalledWith('Project 1');
    });

    it('should return 400 if name is missing', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Project name is required' });
    });

    it('should return 409 if project name is duplicate (case-insensitive)', async () => {
      const mockProjects = [
        { id: 'project-1', name: 'Project 1', createdAt: '2026-07-11T12:00:00.000Z' }
      ];
      (ProjectService.listProjects as jest.Mock).mockResolvedValue(mockProjects);

      const res = await request(app)
        .post('/api/projects')
        .send({ name: '  project 1  ' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
      expect(ProjectService.createProject).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should delete a project successfully', async () => {
      (ProjectService.deleteProject as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app).delete('/api/projects/project-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(ProjectService.deleteProject).toHaveBeenCalledWith('project-1');
    });
  });

  describe('GET /api/projects/:id/network-config', () => {
    it('should return network config of a project', async () => {
      const mockConfig = { vpcConfig: { name: 'VPC' } };
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue(mockConfig);

      const res = await request(app).get('/api/projects/project-1/network-config');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockConfig);
      expect(ProjectService.getNetworkConfig).toHaveBeenCalledWith('project-1');
    });
  });

  describe('POST /api/projects/:id/network-config', () => {
    it('should save config, enforce policies and return the updated config', async () => {
      const mockConfig = { vpcConfig: { name: 'VPC', cidr: '10.0.0.0/16' } };
      (ProjectService.saveNetworkConfig as jest.Mock).mockResolvedValue(undefined);
      (NetworkService.applyPolicy as jest.Mock).mockResolvedValue(undefined);
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue(mockConfig);

      const res = await request(app)
        .post('/api/projects/project-1/network-config')
        .send({ networkConfig: mockConfig });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockConfig);
      expect(ProjectService.saveNetworkConfig).toHaveBeenCalledWith('project-1', mockConfig);
      expect(NetworkService.applyPolicy).toHaveBeenCalledWith('project-1', mockConfig);
      expect(ProjectService.getNetworkConfig).toHaveBeenCalledWith('project-1');
    });

    it('should return 400 if networkConfig is missing', async () => {
      const res = await request(app)
        .post('/api/projects/project-1/network-config')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'networkConfig is required' });
    });

    it('should save a config whose ASG capacities are within bounds', async () => {
      const mockConfig = { asgs: { 'asg-1': { minCapacity: 1, desiredCapacity: 2, maxCapacity: 4 } } };
      (ProjectService.saveNetworkConfig as jest.Mock).mockResolvedValue(undefined);
      (NetworkService.applyPolicy as jest.Mock).mockResolvedValue(undefined);
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue(mockConfig);

      const res = await request(app)
        .post('/api/projects/project-1/network-config')
        .send({ networkConfig: mockConfig });

      expect(res.status).toBe(200);
      expect(ProjectService.saveNetworkConfig).toHaveBeenCalledWith('project-1', mockConfig);
    });

    it('should return a classified 400 for an out-of-bounds ASG capacity without saving', async () => {
      const res = await request(app)
        .post('/api/projects/project-1/network-config')
        .send({ networkConfig: { asgs: { 'asg-1': { minCapacity: 1, desiredCapacity: 2, maxCapacity: 50 } } } });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CAPACITY');
      expect(res.body.error).toContain('asg-1');
      expect(ProjectService.saveNetworkConfig).not.toHaveBeenCalled();
    });

    it('should return a classified 400 when minCapacity exceeds maxCapacity', async () => {
      const res = await request(app)
        .post('/api/projects/project-1/network-config')
        .send({ networkConfig: { asgs: { 'asg-1': { minCapacity: 5, maxCapacity: 3 } } } });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CAPACITY');
      expect(ProjectService.saveNetworkConfig).not.toHaveBeenCalled();
    });
  });
});
