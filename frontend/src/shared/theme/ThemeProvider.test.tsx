import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './useTheme';
import { THEME_MEDIA_QUERY, THEME_STORAGE_KEY } from './theme';

function createMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: THEME_MEDIA_QUERY,
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as MediaQueryList;

  return {
    matchMedia: vi.fn(() => mediaQuery),
    emit(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach(listener => listener({ matches: nextMatches } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

function Probe() {
  const { preference, resolvedTheme, setThemePreference } = useTheme();
  return (
    <>
      <output aria-label="preference">{preference}</output>
      <output aria-label="resolved theme">{resolvedTheme}</output>
      <button onClick={() => setThemePreference('system')}>System</button>
      <button onClick={() => setThemePreference('light')}>Light</button>
      <button onClick={() => setThemePreference('dark')}>Dark</button>
    </>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows the operating system when no preference is stored', () => {
    const media = createMatchMedia(true);
    vi.stubGlobal('matchMedia', media.matchMedia);

    render(<ThemeProvider><Probe /></ThemeProvider>);

    expect(screen.getByLabelText('preference')).toHaveTextContent('system');
    expect(screen.getByLabelText('resolved theme')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('uses and persists an explicit preference over the operating system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const media = createMatchMedia(true);
    vi.stubGlobal('matchMedia', media.matchMedia);

    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByLabelText('resolved theme')).toHaveTextContent('light');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('reacts to OS changes only while System is selected', () => {
    const media = createMatchMedia(false);
    vi.stubGlobal('matchMedia', media.matchMedia);

    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => media.emit(true));
    expect(screen.getByLabelText('resolved theme')).toHaveTextContent('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    act(() => media.emit(false));
    act(() => media.emit(true));
    expect(screen.getByLabelText('resolved theme')).toHaveTextContent('light');

    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(screen.getByLabelText('resolved theme')).toHaveTextContent('dark');
  });

  it('removes the media listener when the provider unmounts', () => {
    const media = createMatchMedia(false);
    vi.stubGlobal('matchMedia', media.matchMedia);

    const view = render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(media.listenerCount()).toBe(1);
    view.unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
