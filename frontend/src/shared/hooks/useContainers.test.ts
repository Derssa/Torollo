import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContainers } from './useContainers';
import type { ContainerData } from '../types';

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

describe('useContainers', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('populates containers from a successful fetch', async () => {
    const containers: ContainerData[] = [{ id: 'c1', name: 'web-1', state: 'running', status: 'running' }];
    fetchMock.mockResolvedValueOnce(jsonResponse(true, containers));

    const { result } = renderHook(() => useContainers({ projectId: 'p1' }));
    await act(async () => {
      await result.current.fetchContainers();
    });

    expect(result.current.containers).toEqual(containers);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/projects/p1/containers'));
  });

  it('ignores a non-array response body defensively', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { unexpected: 'shape' }));

    const { result } = renderHook(() => useContainers({ projectId: 'p1' }));
    await act(async () => {
      await result.current.fetchContainers();
    });

    expect(result.current.containers).toEqual([]);
  });

  it('toggles loading around a fetch', async () => {
    let resolveFetch: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>(resolve => { resolveFetch = resolve; }));

    const { result } = renderHook(() => useContainers({ projectId: 'p1' }));

    let fetchPromise: Promise<void>;
    act(() => {
      fetchPromise = result.current.fetchContainers();
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch(jsonResponse(true, []));
      await fetchPromise;
    });
    expect(result.current.loading).toBe(false);
  });

  it('on successful create, toasts success and re-fetches containers', async () => {
    const onToast = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, {})) // POST create
      .mockResolvedValueOnce(jsonResponse(true, [])); // GET re-fetch

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onToast }));
    await act(async () => {
      await result.current.createContainer('web-1', 'ubuntu');
    });

    expect(onToast).toHaveBeenCalledWith('Node "web-1" created successfully');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('on failed create, toasts the backend error message and does not re-fetch', async () => {
    const onToast = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: 'name already exists' }));

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onToast }));
    await act(async () => {
      await result.current.createContainer('web-1');
    });

    expect(onToast).toHaveBeenCalledWith('Failed: name already exists');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('startContainer re-fetches containers only when the start request succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, {})) // POST start
      .mockResolvedValueOnce(jsonResponse(true, [])); // GET re-fetch

    const { result } = renderHook(() => useContainers({ projectId: 'p1' }));
    await act(async () => {
      await result.current.startContainer('c1');
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/c1/start');
  });

  it('startContainer does not re-fetch when the start request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(false, {}));

    const { result } = renderHook(() => useContainers({ projectId: 'p1' }));
    await act(async () => {
      await result.current.startContainer('c1');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stopContainer re-fetches containers only when the stop request succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, {}))
      .mockResolvedValueOnce(jsonResponse(true, []));

    const { result } = renderHook(() => useContainers({ projectId: 'p1' }));
    await act(async () => {
      await result.current.stopContainer('c1');
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/c1/stop');
  });

  it('deleteContainer optimistically removes the container, toasts, re-fetches, and resolves true on success', async () => {
    const onToast = vi.fn();
    const containers: ContainerData[] = [
      { id: 'c1', name: 'web-1', state: 'running', status: 'running' },
      { id: 'c2', name: 'web-2', state: 'running', status: 'running' },
    ];
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, containers)) // initial fetch
      .mockResolvedValueOnce(jsonResponse(true, {})) // DELETE
      .mockResolvedValueOnce(jsonResponse(true, containers.filter(c => c.id !== 'c1'))); // re-fetch

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onToast }));
    await act(async () => {
      await result.current.fetchContainers();
    });

    let deleteResult: boolean | undefined;
    await act(async () => {
      deleteResult = await result.current.deleteContainer('c1');
    });

    expect(deleteResult).toBe(true);
    expect(result.current.containers.find(c => c.id === 'c1')).toBeUndefined();
    expect(onToast).toHaveBeenCalledWith('Container deleted');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deleteContainer resolves false and does not toast when the delete request fails', async () => {
    const onToast = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(false, {}));

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onToast }));

    let deleteResult: boolean | undefined;
    await act(async () => {
      deleteResult = await result.current.deleteContainer('c1');
    });

    expect(deleteResult).toBe(false);
    expect(onToast).not.toHaveBeenCalled();
  });

  it('surfaces a generic error toast when createContainer throws (network failure)', async () => {
    const onToast = vi.fn();
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onToast }));
    await act(async () => {
      await result.current.createContainer('web-1');
    });

    expect(onToast).toHaveBeenCalledWith('Error creating container node');
  });
});
