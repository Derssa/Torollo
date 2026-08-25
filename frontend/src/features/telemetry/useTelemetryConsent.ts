import { useSyncExternalStore } from 'react';
import { getTelemetryConsent, subscribeTelemetryConsent } from './consent';
import type { TelemetryConsent } from './consent';

/** Reactive view of the consent value — card and toggle stay in sync. */
export function useTelemetryConsent(): TelemetryConsent {
  return useSyncExternalStore(subscribeTelemetryConsent, getTelemetryConsent);
}
