import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLearningPlayer } from './useLearningPlayer';
import type { Roadmap, StepValidationResponse } from '../../../shared/types/roadmap';

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

const roadmap: Roadmap = {
  schemaVersion: 1,
  id: 'example-first-architecture',
  title: 'Your first architecture',
  description: 'Build a minimal two-tier architecture.',
  language: 'en',
  steps: [
    {
      id: 'create-web-server',
      title: 'Create the web server',
      instruction: 'Drag an Ubuntu node named `web` onto the canvas and start it.',
      validators: [{ type: 'container_running', params: { node: 'web' } }],
    },
    {
      id: 'add-database',
      title: 'Add the database',
      instruction: 'Add a Postgres node named `db`.',
      validators: [{ type: 'container_running', params: { node: 'db' } }],
    },
  ],
};

const passResponse: StepValidationResponse = {
  roadmapId: roadmap.id,
  stepId: 'create-web-server',
  stepPassed: true,
  results: [{ index: 0, type: 'container_running', status: 'pass', message: 'Running.' }],
  checkedAt: '2026-07-15T10:00:00.000Z',
};

async function openExampleRoadmap(
  result: { current: ReturnType<typeof useLearningPlayer> },
  fetchMock: ReturnType<typeof vi.fn>
) {
  fetchMock.mockResolvedValueOnce(jsonResponse(true, roadmap));
  await act(async () => {
    await result.current.openRoadmap({ id: roadmap.id, language: 'en' });
  });
}

describe('useLearningPlayer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
  });

  describe('openRoadmap', () => {
    it('loads the roadmap for the (id, language) pair and starts on step 1', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/learning/roadmaps/example-first-architecture?language=en')
      );
      expect(result.current.roadmap).toEqual(roadmap);
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.currentStep?.id).toBe('create-web-server');
    });

    it('surfaces the server error message on a non-ok response', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(false, { error: 'No roadmap found with id "nope".', code: 'ROADMAP_NOT_FOUND' })
      );

      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await act(async () => {
        await result.current.openRoadmap({ id: 'nope', language: 'en' });
      });

      expect(result.current.roadmap).toBeNull();
      expect(result.current.roadmapError).toBe('No roadmap found with id "nope".');
    });

    it('sets a generic error when the backend is unreachable, and retry succeeds', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'));

      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await act(async () => {
        await result.current.openRoadmap({ id: roadmap.id, language: 'en' });
      });
      expect(result.current.roadmapError).toBe('');

      await openExampleRoadmap(result, fetchMock);
      expect(result.current.roadmapError).toBeNull();
      expect(result.current.roadmap).toEqual(roadmap);
    });
  });

  describe('goToStep', () => {
    it('navigates and clamps to the step range', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      act(() => result.current.goToStep(1));
      expect(result.current.currentStep?.id).toBe('add-database');

      act(() => result.current.goToStep(99));
      expect(result.current.currentStepIndex).toBe(1);

      act(() => result.current.goToStep(-5));
      expect(result.current.currentStepIndex).toBe(0);
    });
  });

  describe('validateCurrentStep', () => {
    it('posts the current step and stores the response under its step id', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      fetchMock.mockResolvedValueOnce(jsonResponse(true, passResponse));
      await act(async () => {
        await result.current.validateCurrentStep();
      });

      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/learning/validate'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: 'p1',
            roadmapId: roadmap.id,
            stepId: 'create-web-server',
          }),
        })
      );
      expect(result.current.resultsByStepId['create-web-server']).toEqual(passResponse);
    });

    it('keeps a step result when navigating away and back', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      fetchMock.mockResolvedValueOnce(jsonResponse(true, passResponse));
      await act(async () => {
        await result.current.validateCurrentStep();
      });

      act(() => result.current.goToStep(1));
      act(() => result.current.goToStep(0));

      expect(result.current.resultsByStepId['create-web-server']).toEqual(passResponse);
    });

    it('sends a single request when validate is triggered twice synchronously', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);
      const callsAfterOpen = fetchMock.mock.calls.length;

      fetchMock.mockResolvedValue(jsonResponse(true, passResponse));
      await act(async () => {
        const first = result.current.validateCurrentStep();
        const second = result.current.validateCurrentStep();
        await Promise.all([first, second]);
      });

      expect(fetchMock.mock.calls.length).toBe(callsAfterOpen + 1);
    });

    it('sets a generic validation error when the backend is unreachable, without storing a result', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      fetchMock.mockRejectedValueOnce(new Error('network down'));
      await act(async () => {
        await result.current.validateCurrentStep();
      });

      expect(result.current.validationError).toBe('');
      expect(result.current.resultsByStepId).toEqual({});
      expect(result.current.validating).toBe(false);
    });

    it('surfaces the server error on a non-ok response and recovers on retry', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      fetchMock.mockResolvedValueOnce(
        jsonResponse(false, { error: 'No project found with id "p1".', code: 'PROJECT_NOT_FOUND' })
      );
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      expect(result.current.validationError).toBe('No project found with id "p1".');

      fetchMock.mockResolvedValueOnce(jsonResponse(true, passResponse));
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      expect(result.current.validationError).toBeNull();
      expect(result.current.resultsByStepId['create-web-server']).toEqual(passResponse);
    });

    it('clears the validation error when navigating between steps', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      fetchMock.mockRejectedValueOnce(new Error('network down'));
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      expect(result.current.validationError).not.toBeNull();

      act(() => result.current.goToStep(1));
      expect(result.current.validationError).toBeNull();
    });
  });

  describe('closeRoadmap', () => {
    it('returns to the catalogue state and drops in-memory results', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      fetchMock.mockResolvedValueOnce(jsonResponse(true, passResponse));
      await act(async () => {
        await result.current.validateCurrentStep();
      });

      act(() => result.current.closeRoadmap());

      expect(result.current.roadmap).toBeNull();
      expect(result.current.resultsByStepId).toEqual({});
      expect(result.current.currentStepIndex).toBe(0);
    });
  });
});
