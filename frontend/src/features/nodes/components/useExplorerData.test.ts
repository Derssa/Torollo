import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useExplorerData } from './useExplorerData';
import { mockFetchResponses } from '../../../test-utils/mockFetchSequence';

const URL = 'http://test/api/explorer';

describe('useExplorerData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches on mount and exposes the data', async () => {
    const fetchMock = mockFetchResponses([{ ok: true, json: [{ key: 'a' }] }]);

    const { result } = renderHook(() => useExplorerData(URL, 'fallback'));

    await waitFor(() => expect(result.current.data).toEqual([{ key: 'a' }]));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(URL);
  });

  it('exposes a non-startup error (falling back to the provided message)', async () => {
    mockFetchResponses([{ ok: false, json: { error: 'connection refused' } }, { ok: false, json: {} }]);

    const { result } = renderHook(() => useExplorerData(URL, 'Failed to inspect schema'));

    await waitFor(() => expect(result.current.error).toBe('connection refused'));

    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).toBe('Failed to inspect schema');
  });

  it('sets the starting_up sentinel and auto-retries after 2.5s', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetchResponses([
      { ok: false, json: { error: 'Container is starting up' } },
      { ok: true, json: [{ key: 'ready' }] },
    ]);

    const { result } = renderHook(() => useExplorerData(URL, 'fallback'));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.error).toBe('starting_up');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.data).toEqual([{ key: 'ready' }]);
    expect(result.current.error).toBeNull();
  });

  it('does not stack overlapping auto-retry timers (auto-retry + manual refetch)', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetchResponses([
      { ok: false, json: { error: 'Container is starting up' } },
      { ok: false, json: { error: 'Container is starting up' } },
      { ok: true, json: [] },
      { ok: true, json: [] },
    ]);

    const { result } = renderHook(() => useExplorerData(URL, 'fallback'));
    await act(async () => {
      await Promise.resolve();
    });

    // Manual refetch while an auto-retry timer is pending: the pending timer
    // is replaced, not duplicated.
    await act(async () => {
      await result.current.refetch();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // No further scheduled fetches.
    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('cancels a pending auto-retry on unmount', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetchResponses([
      { ok: false, json: { error: 'Container is starting up' } },
      { ok: true, json: [] },
    ]);

    const { unmount } = renderHook(() => useExplorerData(URL, 'fallback'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
