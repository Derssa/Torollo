import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLearningProgressSummaries } from './useLearningProgressSummaries';
import type { ProgressEntrySummary } from '../../../shared/types/roadmap';

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

const entries: ProgressEntrySummary[] = [
  { projectId: 'p1', roadmapId: 'cache-aside-redis', updatedAt: '2026-07-20T10:00:00.000Z', completedSteps: 3 },
  { projectId: 'p2', roadmapId: 'cache-aside-redis', updatedAt: '2026-07-21T10:00:00.000Z', completedSteps: 1 },
  { projectId: 'p1', roadmapId: 'resilient-three-tier', updatedAt: '2026-07-19T10:00:00.000Z', completedSteps: 5 },
];

describe('useLearningProgressSummaries', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only the most recent entry per roadmap', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { entries }));

    const { result } = renderHook(() => useLearningProgressSummaries());
    await act(async () => {
      await result.current.fetchProgress();
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/learning/progress'));
    expect(result.current.byRoadmapId['cache-aside-redis']).toMatchObject({
      projectId: 'p2',
      completedSteps: 1,
    });
    expect(result.current.byRoadmapId['resilient-three-tier']).toMatchObject({
      projectId: 'p1',
      completedSteps: 5,
    });
    expect(result.current.error).toBe(false);
  });

  it('flags an error on an unexpected response shape', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { unexpected: 'shape' }));

    const { result } = renderHook(() => useLearningProgressSummaries());
    await act(async () => {
      await result.current.fetchProgress();
    });

    expect(result.current.byRoadmapId).toEqual({});
    expect(result.current.error).toBe(true);
  });

  it('flags an error when the backend is unreachable, and retry clears it', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(true, { entries: [] }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useLearningProgressSummaries());
    await act(async () => {
      await result.current.fetchProgress();
    });
    expect(result.current.error).toBe(true);

    await act(async () => {
      await result.current.fetchProgress();
    });
    expect(result.current.error).toBe(false);

    errorSpy.mockRestore();
  });
});
