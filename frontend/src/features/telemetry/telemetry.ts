import { getInstallId, getTelemetryConsent } from './consent';
import type { DockerHealthReason } from '../../shared/hooks/useDockerHealth';

/**
 * The exhaustive event list with the props each one carries, mirrored
 * verbatim in the README's Telemetry section. Adding an event or a prop here
 * means updating the README in the same change.
 *
 * Prop values are always catalogue ids or closed enums — never free text,
 * names, paths or error messages.
 */
export interface TelemetryEvents {
  /** Once per page load. */
  app_started: Record<string, never>;
  /** The Docker readiness probe that follows app_started. */
  runtime_check_started: Record<string, never>;
  runtime_ready: Record<string, never>;
  runtime_failed: { reason: DockerHealthReason };
  /** A node could not be created because its image failed to download. */
  image_pull_failed: { node: string };
  /** The very first validation this install ever runs. */
  first_validator_run: { roadmap: string; step: string };
  roadmap_started: { roadmap: string };
  step_validated: { roadmap: string; step: string };
  step_failed: { roadmap: string; step: string };
  roadmap_completed: { roadmap: string };
  roadmap_abandoned: { roadmap: string; step: string };
}

export type TelemetryEventName = keyof TelemetryEvents;

// Overridable at build time so self-hosters and forks can point events at
// their own instance — or build with an empty endpoint to hard-disable.
const ENDPOINT: string =
  (import.meta.env.VITE_TELEMETRY_ENDPOINT as string | undefined) ?? 'https://plausible.io/api/event';
const DOMAIN: string =
  (import.meta.env.VITE_TELEMETRY_DOMAIN as string | undefined) ?? 'torollo.app';

declare const __APP_VERSION__: string;

/**
 * Sends one event as a Plausible custom event (Umami and self-hosted
 * Plausible accept the same shape). Hard rules, enforced by tests:
 * without an explicit `accepted` consent this performs ZERO network requests,
 * and the payload never carries PII — only the props declared above, the app
 * version and a random local install id.
 *
 * Fire-and-forget: telemetry must never throw, block, or surface an error.
 */
export function trackEvent<Name extends TelemetryEventName>(
  name: Name,
  props: TelemetryEvents[Name],
  options: { keepalive?: boolean } = {}
): void {
  if (getTelemetryConsent() !== 'accepted' || !ENDPOINT) return;
  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        url: eventUrl(props),
        domain: DOMAIN,
        props: { ...props, install_id: getInstallId(), app_version: __APP_VERSION__ },
      }),
      // keepalive lets the abandon event survive the page being closed.
      keepalive: options.keepalive === true,
    }).catch(() => {});
  } catch {
    // A broken fetch environment must never take the app down with it.
  }
}

/**
 * Plausible requires a page URL per event. Roadmap events are filed under
 * their roadmap so the Pages report doubles as a per-roadmap breakdown;
 * everything else lands on the app root.
 */
function eventUrl(props: TelemetryEvents[TelemetryEventName]): string {
  return 'roadmap' in props ? `app://torollo/roadmap/${props.roadmap}` : 'app://torollo/app';
}
