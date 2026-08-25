import { Request, Response } from 'express';
import docker from '../../../infrastructure/docker/DockerClient';
import { classifyDaemonFailure } from '../../../infrastructure/docker/dockerErrors';

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
        // `reason` is the stable, non-identifying code clients may report;
        // `error` is the raw message for a human reading the response.
        checks: { docker: { status: 'unreachable', reason: classifyDaemonFailure(err), error } },
      });
    }
  }
}
