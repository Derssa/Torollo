import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from './useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('showNotification sets the toast immediately and clears it after the default duration', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showNotification({ type: 'success', message: 'Saved' });
    });
    expect(result.current.toast).toEqual({ type: 'success', message: 'Saved' });

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.toast).toBeNull();
  });

  it('showNotification respects a custom duration', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showNotification({ type: 'warning', message: 'Careful' }, 1000);
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.toast).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toast).toBeNull();
  });

  it.each([
    ['error'],
    ['warning'],
    ['success'],
  ] as const)('showToast honours the explicit "%s" type', (type) => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Une notification', type);
    });
    expect(result.current.toast).toEqual({ type, message: 'Une notification' });
  });

  it('showToast defaults to success when no type is given', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Nœud créé avec succès');
    });
    expect(result.current.toast?.type).toBe('success');
  });

  it('dismissToast clears the toast immediately, independent of the timer', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('Node created successfully');
    });
    expect(result.current.toast).not.toBeNull();

    act(() => {
      result.current.dismissToast();
    });
    expect(result.current.toast).toBeNull();
  });
});
