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

  it('on successful create, notifies success and re-fetches containers', async () => {
    const onNotify = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, {})) // POST create
      .mockResolvedValueOnce(jsonResponse(true, [])); // GET re-fetch

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onNotify }));
    await act(async () => {
      await result.current.createContainer('web-1', 'ubuntu');
    });

    expect(onNotify).toHaveBeenCalledWith({ type: 'success', message: 'Node "web-1" created successfully' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('on failed create, notifies the backend error message and does not re-fetch', async () => {
    const onNotify = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: 'name already exists' }));

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onNotify }));
    await act(async () => {
      await result.current.createContainer('web-1');
    });

    expect(onNotify).toHaveBeenCalledWith({ type: 'error', message: 'name already exists' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('startContainer re-fetches containers when the start request succeeds', async () => {
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

  it('startContainer surfaces the backend error and records it for the node when the request fails', async () => {
    const onNotify = vi.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(false, { error: 'A port this container needs is already taken on your machine.', code: 'PORT_IN_USE' })
    );

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onNotify }));
    await act(async () => {
      await result.current.startContainer('c1');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1); // no re-fetch on failure
    expect(onNotify).toHaveBeenCalledWith({
      type: 'error',
      message: 'A port this container needs is already taken on your machine.',
    });
    expect(result.current.opErrors['c1']).toBe('A port this container needs is already taken on your machine.');
  });

  it('clears the recorded node error once a subsequent start succeeds', async () => {
    const onNotify = vi.fn();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(false, { error: 'port taken' })) // failed start
      .mockResolvedValueOnce(jsonResponse(true, {})) // retried start
      .mockResolvedValueOnce(jsonResponse(true, [])); // GET re-fetch

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onNotify }));
    await act(async () => {
      await result.current.startContainer('c1');
    });
    expect(result.current.opErrors['c1']).toBe('port taken');

    await act(async () => {
      await result.current.startContainer('c1');
    });
    expect(result.current.opErrors['c1']).toBeUndefined();
  });

  it('stopContainer re-fetches containers when the stop request succeeds', async () => {
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

  it('stopContainer surfaces the backend error when the request fails', async () => {
    const onNotify = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: 'daemon down', code: 'DOCKER_UNAVAILABLE' }));

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onNotify }));
    await act(async () => {
      await result.current.stopContainer('c1');
    });

    expect(onNotify).toHaveBeenCalledWith({ type: 'error', message: 'daemon down' });
    expect(result.current.opErrors['c1']).toBe('daemon down');
  });

  it('deleteContainer optimistically removes the container, notifies, re-fetches, and resolves true on success', async () => {
    const onNotify = vi.fn();
    const containers: ContainerData[] = [
      { id: 'c1', name: 'web-1', state: 'running', status: 'running' },
      { id: 'c2', name: 'web-2', state: 'running', status: 'running' },
    ];
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, containers)) // initial fetch
      .mockResolvedValueOnce(jsonResponse(true, {})) // DELETE
      .mockResolvedValueOnce(jsonResponse(true, containers.filter(c => c.id !== 'c1'))); // re-fetch

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onNotify }));
    await act(async () => {
      await result.current.fetchContainers();
    });

    let deleteResult: boolean | undefined;
    await act(async () => {
      deleteResult = await result.current.deleteContainer('c1');
    });

    expect(deleteResult).toBe(true);
    expect(result.current.containers.find(c => c.id === 'c1')).toBeUndefined();
    expect(onNotify).toHaveBeenCalledWith({ type: 'success', message: 'Container deleted' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deleteContainer resolves false and surfaces the backend error when the request fails', async () => {
    const onNotify = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: 'container is in use' }));

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onNotify }));

    let deleteResult: boolean | undefined;
    await act(async () => {
      deleteResult = await result.current.deleteContainer('c1');
    });

    expect(deleteResult).toBe(false);
    expect(onNotify).toHaveBeenCalledWith({ type: 'error', message: 'container is in use' });
    expect(result.current.opErrors['c1']).toBe('container is in use');
  });

  it('surfaces a generic error notification when createContainer throws (network failure)', async () => {
    const onNotify = vi.fn();
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useContainers({ projectId: 'p1', onNotify }));
    await act(async () => {
      await result.current.createContainer('web-1');
    });

    expect(onNotify).toHaveBeenCalledWith({ type: 'error', message: 'Error creating container node' });
  });

  it('flags Docker as unavailable after two consecutive failed polls and resets on success', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(false, { error: 'Cannot reach the Docker daemon.', code: 'DOCKER_UNAVAILABLE' }))
      .mockResolvedValueOnce(jsonResponse(false, { error: 'Cannot reach the Docker daemon.', code: 'DOCKER_UNAVAILABLE' }))
      .mockResolvedValueOnce(jsonResponse(true, []));

    const { result } = renderHook(() => useContainers({ projectId: 'p1' }));

    await act(async () => {
      await result.current.fetchContainers();
    });
    expect(result.current.dockerUnavailable).toBe(false); // a single failed poll is tolerated

    await act(async () => {
      await result.current.fetchContainers();
    });
    expect(result.current.dockerUnavailable).toBe(true);

    await act(async () => {
      await result.current.fetchContainers();
    });
    expect(result.current.dockerUnavailable).toBe(false);
  });

  it('counts a network-level poll failure towards Docker unavailability', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useContainers({ projectId: 'p1' }));

    await act(async () => {
      await result.current.fetchContainers();
      await result.current.fetchContainers();
    });

    expect(result.current.dockerUnavailable).toBe(true);
  });
});
