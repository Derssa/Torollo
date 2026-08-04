import { useCallback, useState } from 'react';
import { API_BASE } from '../types';

/** `unknown` until the first probe answers — the UI stays silent rather than guessing. */
export type DockerHealth = 'unknown' | 'ok' | 'down';

/**
 * Probes the backend's Docker readiness (GET /health, which pings the daemon).
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
    try {
      setChecking(true);
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      setStatus(data?.checks?.docker?.status === 'ok' ? 'ok' : 'down');
    } catch {
      // Backend unreachable: no Docker either, as far as the user is concerned.
      setStatus('down');
    } finally {
      setChecking(false);
    }
  }, []);

  return { status, checking, check };
}
