import request from 'supertest';
import express from 'express';
import { AsgController } from './asgController';
import { AsgService } from '../services/asgService';
import { InvalidImageReferenceError } from '../../../infrastructure/docker/imageReference';

jest.mock('../services/asgService');

const app = express();
app.use(express.json());

app.post('/api/projects/:projectId/containers/asg/:asgId/deploy', AsgController.deploy);
app.post('/api/projects/:projectId/containers/asg/:asgId/scale', AsgController.scale);

const deployUrl = '/api/projects/test-project/containers/asg/asg-1/deploy';
const scaleUrl = '/api/projects/test-project/containers/asg/asg-1/scale';

describe('AsgController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsgService.deployASG as jest.Mock).mockResolvedValue([]);
    (AsgService.scaleASG as jest.Mock).mockResolvedValue([]);
  });

  describe('POST .../asg/:asgId/deploy', () => {
    it('deploys with the requested capacity', async () => {
      const res = await request(app)
        .post(deployUrl)
        .send({ parentNodeId: 'node-1', desiredCapacity: 10, subnetIds: ['s1'] });

      expect(res.status).toBe(200);
      expect(AsgService.deployASG).toHaveBeenCalledWith('test-project', 'asg-1', 'node-1', 10, ['s1']);
    });

    it('defaults desiredCapacity to 1 when omitted', async () => {
      const res = await request(app)
        .post(deployUrl)
        .send({ parentNodeId: 'node-1', subnetIds: ['s1'] });

      expect(res.status).toBe(200);
      expect(AsgService.deployASG).toHaveBeenCalledWith('test-project', 'asg-1', 'node-1', 1, ['s1']);
    });

    it.each([[11], [0], [-1], [2.5], ['7']])(
      'rejects desiredCapacity %p with a classified 400 without calling the service',
      async desiredCapacity => {
        const res = await request(app)
          .post(deployUrl)
          .send({ parentNodeId: 'node-1', desiredCapacity, subnetIds: ['s1'] });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_CAPACITY');
        expect(res.body.error).toBeTruthy();
        expect(AsgService.deployASG).not.toHaveBeenCalled();
      }
    );

    it('still requires parentNodeId', async () => {
      const res = await request(app).post(deployUrl).send({ subnetIds: ['s1'] });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'parentNodeId is required to deploy ASG' });
    });

    it('still requires subnetIds', async () => {
      const res = await request(app).post(deployUrl).send({ parentNodeId: 'node-1' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'At least one target subnetId is required' });
    });

    it('answers 400 INVALID_IMAGE_REFERENCE when the service rejects the golden image reference', async () => {
      (AsgService.deployASG as jest.Mock).mockRejectedValue(new InvalidImageReferenceError('bad image'));
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await request(app)
        .post(deployUrl)
        .send({ parentNodeId: 'node-1', desiredCapacity: 2, subnetIds: ['s1'] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_IMAGE_REFERENCE');
      expect(res.body.error).toContain('bad image');
      consoleError.mockRestore();
    });
  });

  describe('POST .../asg/:asgId/scale', () => {
    it.each([[0], [10]])('scales to %d', async desiredCapacity => {
      const res = await request(app).post(scaleUrl).send({ desiredCapacity, subnetIds: ['s1'] });

      expect(res.status).toBe(200);
      expect(AsgService.scaleASG).toHaveBeenCalledWith('test-project', 'asg-1', desiredCapacity, ['s1']);
    });

    it('defaults desiredCapacity to 1 when omitted', async () => {
      const res = await request(app).post(scaleUrl).send({ subnetIds: ['s1'] });

      expect(res.status).toBe(200);
      expect(AsgService.scaleASG).toHaveBeenCalledWith('test-project', 'asg-1', 1, ['s1']);
    });

    it.each([[11], [-1], [1.5], ['7'], [null]])(
      'rejects desiredCapacity %p with a classified 400 without calling the service',
      async desiredCapacity => {
        const res = await request(app).post(scaleUrl).send({ desiredCapacity, subnetIds: ['s1'] });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_CAPACITY');
        expect(AsgService.scaleASG).not.toHaveBeenCalled();
      }
    );

    it('still requires subnetIds', async () => {
      const res = await request(app).post(scaleUrl).send({ desiredCapacity: 2 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'At least one target subnetId is required' });
    });
  });
});
