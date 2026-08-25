import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeDockerHealth } from './useDockerHealth';

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

describe('probeDockerHealth', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is ok when the backend reports Docker as ok', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { checks: { docker: { status: 'ok' } } }));
    await expect(probeDockerHealth()).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/health'), expect.anything());
  });

  it('passes the backend reason through', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(false, { checks: { docker: { status: 'unreachable', reason: 'permission_denied' } } })
    );
    await expect(probeDockerHealth()).resolves.toEqual({ status: 'down', reason: 'permission_denied' });
  });

  it('normalizes a reason it does not know to unknown', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(false, { checks: { docker: { status: 'unreachable', reason: 'brand_new_code' } } })
    );
    await expect(probeDockerHealth()).resolves.toEqual({ status: 'down', reason: 'unknown' });
  });

  it('is down with backend_unreachable when the request fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(probeDockerHealth()).resolves.toEqual({ status: 'down', reason: 'backend_unreachable' });
  });

  it('is down with timeout when the backend never answers', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    );
    const probe = probeDockerHealth();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(probe).resolves.toEqual({ status: 'down', reason: 'timeout' });
  });
});
