import { Request, Response } from 'express';
import docker from '../../../infrastructure/docker/DockerClient';
import { classifyDaemonFailure } from '../../../infrastructure/docker/dockerErrors';
import { getStartupState, StartupState } from '../../../infrastructure/docker/startupState';

// A daemon that is still booting (Docker Desktop, WSL2) can leave the ping
// hanging for minutes; a bounded wait turns that into a `timeout` reason.
const PING_TIMEOUT_MS = 10_000;

export function pingWithTimeout(timeoutMs = PING_TIMEOUT_MS): Promise<unknown> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(`Docker did not answer within ${timeoutMs / 1000}s`), { code: 'ETIMEDOUT' }));
    }, timeoutMs);
  });
  return Promise.race([docker.ping(), timeout]).finally(() => clearTimeout(timer));
}

/**
 * The startup routine as a client sees it: whether it is still running, which
 * image it is on, and whether the host networking rules the subnet engine
 * needs could be applied. Never carries socket paths or raw Docker payloads.
 */
function describeStartup(state: StartupState) {
  const network =
    state.hostForwarding.status === 'unsupported'
      ? { status: 'unsupported' as const, reason: state.hostForwarding.reason }
      : state.hostForwarding.status === 'applied'
        ? { status: 'ok' as const }
        : { status: state.hostForwarding.status };
  return {
    rootless: state.rootless,
    network,
    startup: { status: state.status, images: state.images, error: state.error },
  };
}

export class HealthController {
  static async check(_req: Request, res: Response): Promise<void> {
    const { rootless, network, startup } = describeStartup(getStartupState());
    try {
      await pingWithTimeout();
      res.status(200).json({
        status: 'ok',
        checks: {
          docker: rootless === null ? { status: 'ok' } : { status: 'ok', rootless },
          network,
        },
        startup,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      res.status(503).json({
        status: 'degraded',
        // `reason` is the stable, non-identifying code clients may report;
        // `error` is the raw message for a human reading the response.
        checks: {
          docker: { status: 'unreachable', reason: classifyDaemonFailure(err), error },
          network,
        },
        startup,
      });
    }
  }
}
