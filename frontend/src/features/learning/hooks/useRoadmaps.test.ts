import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoadmaps } from './useRoadmaps';
import type { RoadmapSummary } from '../../../shared/types/roadmap';

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

const summaries: RoadmapSummary[] = [
  {
    id: 'example-first-architecture',
    title: 'Your first architecture',
    description: 'Build a minimal two-tier architecture.',
    language: 'en',
    difficulty: 'beginner',
    estimatedMinutes: 30,
    stepCount: 4,
  },
];

describe('useRoadmaps', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('populates summaries from a successful fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, summaries));

    const { result } = renderHook(() => useRoadmaps());
    await act(async () => {
      await result.current.fetchRoadmaps();
    });

    expect(result.current.summaries).toEqual(summaries);
    expect(result.current.error).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/learning/roadmaps'));
  });

  it('flags an error on a non-array response body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { unexpected: 'shape' }));

    const { result } = renderHook(() => useRoadmaps());
    await act(async () => {
      await result.current.fetchRoadmaps();
    });

    expect(result.current.summaries).toEqual([]);
    expect(result.current.error).toBe(true);
  });

  it('flags an error when the backend is unreachable, and retry clears it', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(true, summaries));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useRoadmaps());
    await act(async () => {
      await result.current.fetchRoadmaps();
    });
    expect(result.current.error).toBe(true);

    await act(async () => {
      await result.current.fetchRoadmaps();
    });
    expect(result.current.error).toBe(false);
    expect(result.current.summaries).toEqual(summaries);

    errorSpy.mockRestore();
  });
});
