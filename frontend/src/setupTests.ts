import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25 exposes an incomplete experimental localStorage global that can take
// precedence over jsdom's implementation. Normalize it before i18n or tests
// read browser storage so the suite behaves consistently across supported CI
// and newer local runtimes.
if (typeof globalThis.localStorage?.getItem !== 'function') {
  const values = new Map<string, string>();
  Object.defineProperties(Storage.prototype, {
    length: {
      configurable: true,
      get: () => values.size,
    },
    clear: {
      configurable: true,
      writable: true,
      value: () => values.clear(),
    },
    getItem: {
      configurable: true,
      writable: true,
      value: (key: string) => values.get(key) ?? null,
    },
    key: {
      configurable: true,
      writable: true,
      value: (index: number) => Array.from(values.keys())[index] ?? null,
    },
    removeItem: {
      configurable: true,
      writable: true,
      value: (key: string) => values.delete(key),
    },
    setItem: {
      configurable: true,
      writable: true,
      value: (key: string, value: string) => values.set(key, String(value)),
    },
  });
  const storage = Object.create(Storage.prototype) as Storage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

// Initialize the i18next singleton once for every test. Components render through
// react-i18next's `t()`, so without this they would render raw keys. Language
// defaults to 'en' (empty localStorage), matching the English strings assertions expect.
await import('./i18n');

// Testing Library's automatic cleanup relies on a global afterEach, which is
// absent when Vitest runs without `globals: true` — register it explicitly.
afterEach(cleanup);

// @xyflow/react measures nodes via ResizeObserver, which jsdom does not implement.
// A minimal polyfill is sufficient — tests never depend on real observed sizes.
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver =
  ResizeObserverPolyfill;

// jsdom does not implement matchMedia.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
