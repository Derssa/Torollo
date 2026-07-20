import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
// Initialize the i18next singleton once for every test. Components render through
// react-i18next's `t()`, so without this they would render raw keys. Language
// defaults to 'en' (empty localStorage), matching the English strings assertions expect.
import './i18n';

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
