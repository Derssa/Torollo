/**
 * Progress of the startup routine (shared network, host forwarding rules,
 * image pulls) that DockerInitializer runs in the background once the HTTP
 * server listens. GET /health exposes it, so the CLI can show a first run
 * (several minutes of image downloads) instead of announcing "ready" blindly.
 *
 * Plain data, no Docker types: the same shape is read by the CLI and the
 * frontend, neither of which knows about dockerode.
 */

export type StartupStatus = 'pending' | 'running' | 'ready' | 'failed';

export type ImageAction = 'checking' | 'pulling' | 'building';

/**
 * Whether the host-level iptables rules the subnet/NAT engine relies on could
 * be applied. `unsupported` is rootless Docker: containers work, but a
 * privileged host-network container cannot touch the host's netfilter.
 */
export type HostForwardingStatus = 'pending' | 'applied' | 'unsupported' | 'failed';

export interface ImageProgress {
  total: number;
  ready: number;
  current: { label: string; action: ImageAction } | null;
}

export interface StartupState {
  status: StartupStatus;
  /** null until `docker info` answered. */
  rootless: boolean | null;
  hostForwarding: { status: HostForwardingStatus; reason?: 'rootless' | 'error' };
  images: ImageProgress;
  /** Human-readable message of the failure that stopped the routine. */
  error: string | null;
}

function initialState(): StartupState {
  return {
    status: 'pending',
    rootless: null,
    hostForwarding: { status: 'pending' },
    images: { total: 0, ready: 0, current: null },
    error: null,
  };
}

let state: StartupState = initialState();

export function getStartupState(): StartupState {
  // Callers get a snapshot so a JSON response cannot observe a half-updated state.
  return {
    ...state,
    hostForwarding: { ...state.hostForwarding },
    images: { ...state.images, current: state.images.current ? { ...state.images.current } : null },
  };
}

export function startupBegan(): void {
  state = { ...initialState(), status: 'running' };
}

export function rootlessDetected(rootless: boolean): void {
  state.rootless = rootless;
}

export function hostForwardingResolved(status: Exclude<HostForwardingStatus, 'pending'>): void {
  const reason = status === 'unsupported' ? 'rootless' : status === 'failed' ? 'error' : undefined;
  state.hostForwarding = reason ? { status, reason } : { status };
}

export function imagesPlanned(total: number): void {
  state.images = { total, ready: 0, current: null };
}

export function imageStarted(label: string, action: ImageAction): void {
  state.images.current = { label, action };
}

export function imageReady(): void {
  state.images.ready += 1;
  state.images.current = null;
}

export function startupFinished(): void {
  state.status = 'ready';
  state.images.current = null;
}

export function startupFailed(err: unknown): void {
  state.status = 'failed';
  state.error = err instanceof Error ? err.message : String(err);
}

/** Test hook. */
export function resetStartupState(): void {
  state = initialState();
}
