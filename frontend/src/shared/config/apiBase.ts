export interface ApiBaseOptions {
  runtimeUrl?: string
  runtimePort?: number
  hostname: string
}

declare global {
  interface Window {
    TOROLLO_BACKEND_URL?: string
    TOROLLO_BACKEND_PORT?: number
  }
}

/**
 * Same-origin deployments (Compose, behind the nginx proxy) inject an explicit
 * runtime URL through `env.js`. Everywhere else — Vite dev and the CLI — the
 * API answers on its own port, on the host the page was served from.
 */
export function resolveApiBase({
  runtimeUrl,
  runtimePort,
  hostname,
}: ApiBaseOptions): string {
  if (runtimeUrl !== undefined) {
    return runtimeUrl.replace(/\/$/, '')
  }

  return `http://${hostname}:${runtimePort || 23233}`
}

const viteBackendPort = Number(import.meta.env.VITE_TOROLLO_BACKEND_PORT)

export const API_BASE = resolveApiBase({
  runtimeUrl: window.TOROLLO_BACKEND_URL,
  runtimePort: import.meta.env.DEV && Number.isInteger(viteBackendPort) && viteBackendPort > 0
    ? viteBackendPort
    : window.TOROLLO_BACKEND_PORT,
  hostname: window.location.hostname,
})
