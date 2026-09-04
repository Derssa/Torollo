import request from 'supertest';
import express from 'express';
import { HealthController, pingWithTimeout } from './healthController';
import docker from '../../../infrastructure/docker/DockerClient';
import {
  hostForwardingResolved,
  imagesPlanned,
  imageStarted,
  resetStartupState,
  rootlessDetected,
  startupBegan,
  startupFailed,
  startupFinished,
} from '../../../infrastructure/docker/startupState';

jest.mock('../../../infrastructure/docker/DockerClient', () => ({
  ping: jest.fn(),
}));

const app = express();
app.get('/health', HealthController.check);

describe('pingWithTimeout', () => {
  it('rejects with ETIMEDOUT when the daemon never answers', async () => {
    (docker.ping as jest.Mock).mockReturnValue(new Promise(() => {}));

    await expect(pingWithTimeout(20)).rejects.toMatchObject({ code: 'ETIMEDOUT' });
  });

  it('resolves when the daemon answers in time', async () => {
    (docker.ping as jest.Mock).mockResolvedValue('OK');

    await expect(pingWithTimeout(1_000)).resolves.toBe('OK');
  });
});

describe('HealthController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStartupState();
  });

  describe('GET /health', () => {
    it('should return 200 ok when Docker is reachable', async () => {
      (docker.ping as jest.Mock).mockResolvedValue('OK');

      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        checks: { docker: { status: 'ok' }, network: { status: 'pending' } },
        startup: { status: 'pending', images: { total: 0, ready: 0, current: null }, error: null },
      });
    });

    it('should return 503 degraded with a stable reason when Docker is unreachable', async () => {
      const err = Object.assign(new Error('connect ENOENT /var/run/docker.sock'), { code: 'ENOENT' });
      (docker.ping as jest.Mock).mockRejectedValue(err);

      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.checks.docker).toEqual({
        status: 'unreachable',
        reason: 'socket_not_found',
        error: 'connect ENOENT /var/run/docker.sock',
      });
    });

    it('should report an unknown reason for an unclassified failure', async () => {
      (docker.ping as jest.Mock).mockRejectedValue(new Error('boom'));

      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.checks.docker.reason).toBe('unknown');
    });

    it('should answer timeout when the daemon ping hangs', async () => {
      (docker.ping as jest.Mock).mockRejectedValue(Object.assign(new Error('Docker did not answer within 10s'), { code: 'ETIMEDOUT' }));

      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.checks.docker.reason).toBe('timeout');
    });

    it('should expose the image being pulled while startup runs', async () => {
      (docker.ping as jest.Mock).mockResolvedValue('OK');
      startupBegan();
      rootlessDetected(false);
      hostForwardingResolved('applied');
      imagesPlanned(5);
      imageStarted('Redis', 'pulling');

      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.checks.docker).toEqual({ status: 'ok', rootless: false });
      expect(res.body.checks.network).toEqual({ status: 'ok' });
      expect(res.body.startup).toEqual({
        status: 'running',
        images: { total: 5, ready: 0, current: { label: 'Redis', action: 'pulling' } },
        error: null,
      });
    });

    it('should flag the network engine as unsupported on rootless Docker', async () => {
      (docker.ping as jest.Mock).mockResolvedValue('OK');
      startupBegan();
      rootlessDetected(true);
      hostForwardingResolved('unsupported');
      startupFinished();

      const res = await request(app).get('/health');

      expect(res.body.checks.docker).toEqual({ status: 'ok', rootless: true });
      expect(res.body.checks.network).toEqual({ status: 'unsupported', reason: 'rootless' });
      expect(res.body.startup.status).toBe('ready');
    });

    it('should carry the startup error message when the routine failed', async () => {
      (docker.ping as jest.Mock).mockResolvedValue('OK');
      startupBegan();
      hostForwardingResolved('failed');
      startupFailed(new Error('pull access denied for derssa/backend-lab-redis'));

      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.checks.network).toEqual({ status: 'failed' });
      expect(res.body.startup.status).toBe('failed');
      expect(res.body.startup.error).toBe('pull access denied for derssa/backend-lab-redis');
    });
  });
});
