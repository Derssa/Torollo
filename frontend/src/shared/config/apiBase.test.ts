import { describe, expect, it } from 'vitest'
import { resolveApiBase } from './apiBase'

describe('resolveApiBase', () => {
  it('uses the runtime URL for a same-origin Compose deployment', () => {
    expect(resolveApiBase({
      runtimeUrl: 'https://torollo.example.test/',
      hostname: 'torollo.example.test',
    })).toBe('https://torollo.example.test')
  })

  it('prefers the runtime URL over a configured port', () => {
    expect(resolveApiBase({
      runtimeUrl: 'http://torollo.example.test:8080',
      runtimePort: 24001,
      hostname: 'torollo.example.test',
    })).toBe('http://torollo.example.test:8080')
  })

  it('falls back to the page host on the configured port', () => {
    expect(resolveApiBase({
      runtimePort: 24001,
      hostname: '192.168.1.50',
    })).toBe('http://192.168.1.50:24001')
  })

  it('uses the legacy default port when no runtime configuration exists', () => {
    expect(resolveApiBase({
      hostname: 'localhost',
    })).toBe('http://localhost:23233')
  })
})
