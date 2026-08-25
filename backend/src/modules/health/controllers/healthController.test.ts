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

    it('should return 503 degraded with a stable reason when Docker is unreachable', async () => {
      const err = Object.assign(new Error('connect ENOENT /var/run/docker.sock'), { code: 'ENOENT' });
      (docker.ping as jest.Mock).mockRejectedValue(err);

      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: 'degraded',
        checks: {
          docker: {
            status: 'unreachable',
            reason: 'socket_not_found',
            error: 'connect ENOENT /var/run/docker.sock',
          },
        },
      });
    });

    it('should report an unknown reason for an unclassified failure', async () => {
      (docker.ping as jest.Mock).mockRejectedValue(new Error('boom'));

      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.checks.docker.reason).toBe('unknown');
    });
  });
});
