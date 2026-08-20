const CONSENT_KEY = 'torollo_telemetry_consent';
const INSTALL_ID_KEY = 'torollo_telemetry_install_id';

/**
 * Tri-state on purpose: `unset` (never asked or storage unavailable) must
 * behave exactly like `declined` — zero network — while still telling the UI
 * that the consent prompt has not been answered yet.
 */
export type TelemetryConsent = 'accepted' | 'declined' | 'unset';

const listeners = new Set<() => void>();

export function getTelemetryConsent(): TelemetryConsent {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    return stored === 'accepted' || stored === 'declined' ? stored : 'unset';
  } catch {
    // Storage disabled (private mode, hardened profile): treat as never
    // asked, which the sender treats as declined.
    return 'unset';
  }
}

export function setTelemetryConsent(value: 'accepted' | 'declined'): void {
  try {
    localStorage.setItem(CONSENT_KEY, value);
    // Revoking consent also forgets the install id: re-enabling later starts
    // a fresh anonymous identity instead of relinking to the old one.
    if (value === 'declined') localStorage.removeItem(INSTALL_ID_KEY);
  } catch {
    // Nothing to persist to — the runtime default (unset → no events) holds.
  }
  listeners.forEach(listener => listener());
}

/** Subscription for useSyncExternalStore, so every consent UI stays in sync. */
export function subscribeTelemetryConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Random, locally-generated install id. Created lazily on first use — which
 * only ever happens after consent — so a declined install carries no id at
 * all. Never derived from anything about the machine or the user.
 */
export function getInstallId(): string {
  try {
    const existing = localStorage.getItem(INSTALL_ID_KEY);
    if (existing) return existing;
    const id = generateId();
    localStorage.setItem(INSTALL_ID_KEY, id);
    return id;
  } catch {
    // No storage means a new id per event; anonymity is preserved either way.
    return generateId();
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}
