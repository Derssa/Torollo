import request from 'supertest';
import express from 'express';
import { HealthController } from './healthController';
import docker from '../../../infrastructure/docker/DockerClient';

jest.mock('../../../infrastructure/docker/DockerClient', () => ({
  ping: jest.fn(),
}));

const app = express();
app.get('/health', HealthController.check);

describe('HealthController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 ok when Docker is reachable', async () => {
      (docker.ping as jest.Mock).mockResolvedValue('OK');

      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        checks: { docker: { status: 'ok' } },
      });
    });

    it('should return 503 degraded when Docker is unreachable', async () => {
      (docker.ping as jest.Mock).mockRejectedValue(
        new Error('connect ENOENT /var/run/docker.sock')
      );

      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: 'degraded',
        checks: {
          docker: { status: 'unreachable', error: 'connect ENOENT /var/run/docker.sock' },
        },
      });
    });
  });
});
