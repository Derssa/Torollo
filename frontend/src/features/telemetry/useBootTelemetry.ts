import { useEffect, useRef } from 'react';
import { probeDockerHealth } from '../../shared/hooks/useDockerHealth';
import { trackEvent } from './telemetry';
import { useTelemetryConsent } from './useTelemetryConsent';

/**
 * The boot funnel: `app_started`, then one Docker readiness probe reported as
 * `runtime_check_started` → `runtime_ready` | `runtime_failed`. That is where
 * a first run most often dies (Docker Desktop not started, WSL2, socket
 * permissions), long before any roadmap is opened.
 *
 * Fires at most once per page load, as soon as consent is on — at mount when
 * it was already given, or the moment the learner accepts the consent card.
 * Without consent nothing runs, not even the (local) health probe.
 */
export function useBootTelemetry(): void {
  const consent = useTelemetryConsent();
  const firedRef = useRef(false);

  useEffect(() => {
    if (consent !== 'accepted' || firedRef.current) return;
    firedRef.current = true;
    trackEvent('app_started', {});
    void reportRuntimeCheck();
  }, [consent]);
}

async function reportRuntimeCheck(): Promise<void> {
  trackEvent('runtime_check_started', {});
  const probe = await probeDockerHealth();
  if (probe.status === 'ok') {
    trackEvent('runtime_ready', {});
  } else {
    trackEvent('runtime_failed', { reason: probe.reason });
  }
}
