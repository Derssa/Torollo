export interface ApiBaseOptions {
  isDevelopment: boolean
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

export function resolveApiBase({
  isDevelopment,
  runtimeUrl,
  runtimePort,
  hostname,
}: ApiBaseOptions): string {
  if (runtimeUrl !== undefined) {
    return runtimeUrl.replace(/\/$/, '')
  }

  if (isDevelopment) {
    return `http://${hostname}:${runtimePort || 23233}`
  }

  return `http://${hostname}:${runtimePort || 23233}`
}

const viteBackendPort = Number(import.meta.env.VITE_TOROLLO_BACKEND_PORT)

export const API_BASE = resolveApiBase({
  isDevelopment: import.meta.env.DEV,
  runtimeUrl: window.TOROLLO_BACKEND_URL,
  runtimePort: import.meta.env.DEV && Number.isInteger(viteBackendPort) && viteBackendPort > 0
    ? viteBackendPort
    : window.TOROLLO_BACKEND_PORT,
  hostname: window.location.hostname,
})
