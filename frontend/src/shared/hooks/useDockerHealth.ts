import { useCallback, useState } from 'react';
import { API_BASE } from '../types';

/** `unknown` until the first probe answers — the UI stays silent rather than guessing. */
export type DockerHealth = 'unknown' | 'ok' | 'down';

/**
 * Why the runtime is not ready. The backend codes come from its `/health`
 * response (`checks.docker.reason`); the first two are decided here, when
 * the backend itself cannot be reached or does not answer in time.
 */
export type DockerHealthReason =
  | 'backend_unreachable'
  | 'timeout'
  | 'socket_not_found'
  | 'permission_denied'
  | 'connection_refused'
  | 'unknown';

const BACKEND_REASONS: readonly DockerHealthReason[] = [
  'timeout',
  'socket_not_found',
  'permission_denied',
  'connection_refused',
  'unknown',
];

export type DockerHealthProbe = { status: 'ok' } | { status: 'down'; reason: DockerHealthReason };

// A daemon that is starting (Docker Desktop, WSL2 boot) can leave the ping
// hanging; cap it so the caller gets a verdict either way.
const PROBE_TIMEOUT_MS = 10_000;

/**
 * Probes the backend's Docker readiness (GET /health, which pings the daemon)
 * and reduces the answer to ready / not ready plus a coarse reason.
 * Never throws: an unreachable backend is a `down` verdict, not an error.
 */
export async function probeDockerHealth(): Promise<DockerHealthProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: controller.signal });
    const data = await res.json();
    if (data?.checks?.docker?.status === 'ok') return { status: 'ok' };
    const reason = data?.checks?.docker?.reason;
    return { status: 'down', reason: BACKEND_REASONS.includes(reason) ? reason : 'unknown' };
  } catch {
    // Backend unreachable: no Docker either, as far as the user is concerned.
    return { status: 'down', reason: controller.signal.aborted ? 'timeout' : 'backend_unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Used before actions that spin up containers, so the learner hears about a
 * stopped daemon before the first failure rather than after it.
 *
 * The caller triggers the probe and retries by calling `check` again — same
 * pattern as useRoadmaps.
 */
export function useDockerHealth() {
  const [status, setStatus] = useState<DockerHealth>('unknown');
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const probe = await probeDockerHealth();
    setStatus(probe.status);
    setChecking(false);
  }, []);

  return { status, checking, check };
}
