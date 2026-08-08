import { describe, expect, it } from 'vitest'
import { resolveApiBase } from './apiBase'

describe('resolveApiBase', () => {
  it('uses the runtime URL for a same-origin Compose deployment', () => {
    expect(resolveApiBase({
      isDevelopment: false,
      runtimeUrl: 'https://torollo.example.test/',
      hostname: 'torollo.example.test',
    })).toBe('https://torollo.example.test')
  })

  it('uses the fixed local backend during Vite development', () => {
    expect(resolveApiBase({
      isDevelopment: true,
      hostname: 'localhost',
    })).toBe('http://localhost:23233')
  })

  it('uses a configured host port during Compose development', () => {
    expect(resolveApiBase({
      isDevelopment: true,
      runtimePort: 24001,
      hostname: '192.168.1.50',
    })).toBe('http://192.168.1.50:24001')
  })

  it('preserves the CLI runtime port fallback in production', () => {
    expect(resolveApiBase({
      isDevelopment: false,
      runtimePort: 24001,
      hostname: '127.0.0.1',
    })).toBe('http://127.0.0.1:24001')
  })

  it('uses the legacy default port when no runtime configuration exists', () => {
    expect(resolveApiBase({
      isDevelopment: false,
      hostname: 'localhost',
    })).toBe('http://localhost:23233')
  })
})
