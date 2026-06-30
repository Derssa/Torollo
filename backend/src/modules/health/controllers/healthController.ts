import { Request, Response } from 'express';
import docker from '../../../infrastructure/docker/DockerClient';

export class HealthController {
  static async check(_req: Request, res: Response): Promise<void> {
    try {
      await docker.ping();
      res.status(200).json({
        status: 'ok',
        checks: { docker: { status: 'ok' } },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      res.status(503).json({
        status: 'degraded',
        checks: { docker: { status: 'unreachable', error } },
      });
    }
  }
}
