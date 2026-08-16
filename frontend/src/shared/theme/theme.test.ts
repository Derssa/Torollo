import { describe, expect, it } from 'vitest';
import {
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from './theme';

describe('theme utilities', () => {
  it('reads supported preferences and rejects unknown values', () => {
    expect(readThemePreference({ getItem: () => 'dark' })).toBe('dark');
    expect(readThemePreference({ getItem: () => 'sepia' })).toBe('system');
    expect(readThemePreference({ getItem: () => null })).toBe('system');
  });

  it('falls back to system when storage is unavailable', () => {
    expect(readThemePreference({
      getItem: () => {
        throw new Error('storage disabled');
      },
    })).toBe('system');
  });

  it('resolves system preference without overriding explicit choices', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('uses the Torollo-scoped storage key', () => {
    expect(THEME_STORAGE_KEY).toBe('torollo_theme');
  });
});
