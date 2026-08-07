import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { THEME_STORAGE_KEY } from '../theme/theme';
import ThemeSelector from './ThemeSelector';

describe('ThemeSelector', () => {
  beforeEach(() => localStorage.clear());

  it('offers all preferences and applies the selected value', () => {
    renderWithProviders(<ThemeSelector />);

    const selector = screen.getByRole('combobox', { name: 'Theme' });
    expect(selector).toHaveValue('system');
    expect(screen.getByRole('option', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dark' })).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'dark' } });
    expect(selector).toHaveValue('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
