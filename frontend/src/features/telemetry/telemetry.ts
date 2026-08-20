import { getInstallId, getTelemetryConsent } from './consent';

/**
 * The five learning-funnel events — the exhaustive list, mirrored verbatim in
 * the README's Telemetry section. Adding an event here means updating the
 * README in the same change.
 */
export type TelemetryEventName =
  | 'roadmap_started'
  | 'step_validated'
  | 'step_failed'
  | 'roadmap_completed'
  | 'roadmap_abandoned';

export interface TelemetryEventProps {
  /** Roadmap id from the public catalogue — never a user-chosen name. */
  roadmap: string;
  /** Step id within the roadmap file, for the funnel/abandon breakdowns. */
  step?: string;
}

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
 * and the payload never carries PII — only catalogue ids, the app version and
 * a random local install id.
 *
 * Fire-and-forget: telemetry must never throw, block, or surface an error.
 */
export function trackEvent(
  name: TelemetryEventName,
  props: TelemetryEventProps,
  options: { keepalive?: boolean } = {}
): void {
  if (getTelemetryConsent() !== 'accepted' || !ENDPOINT) return;
  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        url: `app://torollo/roadmap/${props.roadmap}`,
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
