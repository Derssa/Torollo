import { CorsOptions } from 'cors';

/**
 * Hostnames considered local. Origins pointing at any of these are allowed
 * on any port: the frontend port is picked dynamically by the CLI, and a
 * local process can already reach a loopback-bound API directly.
 */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Parse a comma-separated list of origins (TOROLLO_ALLOWED_ORIGINS). */
export function parseAllowedOrigins(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * An origin is allowed if it is absent (same-origin, curl, health probes),
 * explicitly allowlisted, or a local http(s) origin on any port.
 */
export function isAllowedOrigin(origin: string | undefined, extraOrigins: string[]): boolean {
  if (!origin) return true;
  if (extraOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

const extraOrigins = parseAllowedOrigins(process.env.TOROLLO_ALLOWED_ORIGINS);

/**
 * Origin check for the Socket.IO handshake (allowRequest). CORS alone does
 * not cover direct WebSocket connections, which browsers exempt from CORS.
 */
export function isRequestOriginAllowed(origin?: string): boolean {
  return isAllowedOrigin(origin, extraOrigins);
}

/** Shared CORS options for the HTTP middleware and Socket.IO. */
export const corsConfig: CorsOptions = {
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin, extraOrigins)),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
};
