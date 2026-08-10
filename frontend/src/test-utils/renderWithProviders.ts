import { render, type RenderOptions } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { ThemeProvider } from '../shared/theme/ThemeProvider';

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, {
    wrapper: ({ children }) => createElement(ThemeProvider, null, children),
    ...options,
  });
}
