import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLearningPlayer } from './useLearningPlayer';
import { trackEvent } from '../../telemetry/telemetry';
import type {
  Roadmap,
  RoadmapProgressResponse,
  StepValidationResponse,
} from '../../../shared/types/roadmap';

vi.mock('../../telemetry/telemetry', () => ({ trackEvent: vi.fn() }));
const trackEventMock = vi.mocked(trackEvent);

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
      hints: ['Look at the node palette.', 'Drag the Ubuntu card.'],
      solution: 'Drag an Ubuntu node, name it `web`, click start.',
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

const emptyProgress: RoadmapProgressResponse = {
  projectId: 'p1',
  roadmapId: roadmap.id,
  steps: {},
};

async function openExampleRoadmap(
  result: { current: ReturnType<typeof useLearningPlayer> },
  fetchMock: ReturnType<typeof vi.fn>,
  progress: RoadmapProgressResponse = emptyProgress
) {
  fetchMock.mockResolvedValueOnce(jsonResponse(true, roadmap));
  fetchMock.mockResolvedValueOnce(jsonResponse(true, progress));
  // Default for later untargeted calls (the fire-and-forget hints PUT);
  // per-test mockResolvedValueOnce/mockRejectedValueOnce take precedence.
  fetchMock.mockResolvedValue(jsonResponse(true, {}));
  await act(async () => {
    await result.current.openRoadmap({ id: roadmap.id, language: 'en' });
  });
}

describe('useLearningPlayer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    trackEventMock.mockClear();
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

  describe('revealNextHint', () => {
    it('reveals rungs one at a time for the current step and clamps at the ladder length', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      act(() => result.current.revealNextHint());
      expect(result.current.revealedHintsByStepId['create-web-server']).toBe(1);

      // 2 hints + 1 solution = 3 rungs; extra calls must not go past the end.
      act(() => result.current.revealNextHint());
      act(() => result.current.revealNextHint());
      act(() => result.current.revealNextHint());
      expect(result.current.revealedHintsByStepId['create-web-server']).toBe(3);
    });

    it('does nothing on a step with neither hints nor solution', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      act(() => result.current.goToStep(1));
      act(() => result.current.revealNextHint());
      expect(result.current.revealedHintsByStepId['add-database']).toBe(0);
    });

    it('keeps revealed hints per step when navigating away and back', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      act(() => result.current.revealNextHint());
      act(() => result.current.goToStep(1));
      act(() => result.current.goToStep(0));

      expect(result.current.revealedHintsByStepId['create-web-server']).toBe(1);
    });

    it('rehydrates revealed hints from the store on reopen — an empty store means none', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      act(() => result.current.revealNextHint());
      await openExampleRoadmap(result, fetchMock);

      expect(result.current.revealedHintsByStepId).toEqual({});
    });

    it('pushes the absolute revealed count to the progress endpoint', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      act(() => result.current.revealNextHint());
      act(() => result.current.revealNextHint());

      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining(`/api/learning/progress/p1/${roadmap.id}/hints`),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ stepId: 'create-web-server', revealedHints: 2 }),
        })
      );
    });

    it('never blocks a reveal on a failed push — the local count still advances', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      fetchMock.mockRejectedValueOnce(new Error('network down'));
      await act(async () => {
        result.current.revealNextHint();
      });

      expect(result.current.revealedHintsByStepId['create-web-server']).toBe(1);
    });
  });

  describe('progress hydration', () => {
    it('restores completed steps and revealed hints, and opens on the first incomplete step', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, {
        ...emptyProgress,
        steps: {
          'create-web-server': { passed: true, attempts: 2, revealedHints: 1 },
        },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/api/learning/progress/p1/${roadmap.id}`)
      );
      expect(result.current.completedStepIds).toEqual({ 'create-web-server': true });
      expect(result.current.revealedHintsByStepId).toEqual({ 'create-web-server': 1 });
      expect(result.current.currentStepIndex).toBe(1);
      expect(result.current.resultsByStepId).toEqual({});
    });

    it('opens on the last step when every step is already completed', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, {
        ...emptyProgress,
        steps: {
          'create-web-server': { passed: true, attempts: 1, revealedHints: 0 },
          'add-database': { passed: true, attempts: 1, revealedHints: 0 },
        },
      });

      expect(result.current.currentStepIndex).toBe(1);
      expect(result.current.completedStepIds).toEqual({
        'create-web-server': true,
        'add-database': true,
      });
    });

    it('ignores unknown step ids and clamps revealed hints to the ladder length', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, {
        ...emptyProgress,
        steps: {
          'create-web-server': { passed: false, attempts: 1, revealedHints: 99 },
          'no-such-step': { passed: true, attempts: 1, revealedHints: 2 },
        },
      });

      // 2 hints + 1 solution = 3 rungs.
      expect(result.current.revealedHintsByStepId).toEqual({ 'create-web-server': 3 });
      expect(result.current.completedStepIds).toEqual({});
      expect(result.current.currentStepIndex).toBe(0);
    });

    it('opens fresh on step 1 when the progress endpoint is unreachable', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(true, roadmap));
      fetchMock.mockRejectedValueOnce(new Error('network down'));

      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await act(async () => {
        await result.current.openRoadmap({ id: roadmap.id, language: 'en' });
      });

      expect(result.current.roadmap).toEqual(roadmap);
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.completedStepIds).toEqual({});
    });

    it('raises the recovery notice when the store had to be discarded, dismissible', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, { ...emptyProgress, storeRecovered: true });

      expect(result.current.progressNotice).toBe(true);

      act(() => result.current.dismissProgressNotice());
      expect(result.current.progressNotice).toBe(false);
    });
  });

  describe('resetProgress', () => {
    it('deletes the stored progress and restarts the roadmap from step 1', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, {
        ...emptyProgress,
        steps: { 'create-web-server': { passed: true, attempts: 1, revealedHints: 2 } },
      });
      expect(result.current.currentStepIndex).toBe(1);

      fetchMock.mockResolvedValueOnce(jsonResponse(true, {}));
      await act(async () => {
        await result.current.resetProgress();
      });

      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining(`/api/learning/progress/p1/${roadmap.id}`),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(result.current.currentStepIndex).toBe(0);
      expect(result.current.completedStepIds).toEqual({});
      expect(result.current.revealedHintsByStepId).toEqual({});
      expect(result.current.resultsByStepId).toEqual({});
      expect(result.current.resetError).toBeNull();
    });

    it('keeps the state and surfaces an error when the reset fails', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, {
        ...emptyProgress,
        steps: { 'create-web-server': { passed: true, attempts: 1, revealedHints: 0 } },
      });

      fetchMock.mockRejectedValueOnce(new Error('network down'));
      await act(async () => {
        await result.current.resetProgress();
      });

      expect(result.current.resetError).toBe('');
      expect(result.current.completedStepIds).toEqual({ 'create-web-server': true });
      expect(result.current.resetting).toBe(false);
    });
  });

  describe('completion', () => {
    const completedProgress: RoadmapProgressResponse = {
      ...emptyProgress,
      startedAt: '2026-07-15T09:00:00.000Z',
      steps: {
        'create-web-server': { passed: true, attempts: 1, revealedHints: 0, lastCheckedAt: '2026-07-15T09:30:00.000Z' },
        'add-database': { passed: true, attempts: 1, revealedHints: 0, lastCheckedAt: '2026-07-15T09:45:00.000Z' },
      },
    };

    it('opens the completion screen when a validation turns the last missing step green', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, {
        ...emptyProgress,
        steps: { 'create-web-server': { passed: true, attempts: 1, revealedHints: 0 } },
      });
      expect(result.current.completionOpen).toBe(false);
      expect(result.current.roadmapCompleted).toBe(false);

      // The validate POST, then the startedAt refetch it triggers.
      fetchMock.mockResolvedValueOnce(
        jsonResponse(true, { ...passResponse, stepId: 'add-database' })
      );
      fetchMock.mockResolvedValueOnce(
        jsonResponse(true, { ...emptyProgress, startedAt: '2026-07-15T09:00:00.000Z' })
      );
      await act(async () => {
        await result.current.validateCurrentStep();
      });

      expect(result.current.roadmapCompleted).toBe(true);
      expect(result.current.completionOpen).toBe(true);
      expect(result.current.runTimes).toEqual({
        startedAt: '2026-07-15T09:00:00.000Z',
        finishedAt: passResponse.checkedAt,
      });
    });

    it('does not reopen a dismissed screen when re-validating an already complete roadmap', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, completedProgress);
      expect(result.current.completionOpen).toBe(true);

      act(() => result.current.dismissCompletion());
      expect(result.current.completionOpen).toBe(false);

      act(() => result.current.goToStep(0));
      fetchMock.mockResolvedValueOnce(jsonResponse(true, passResponse));
      await act(async () => {
        await result.current.validateCurrentStep();
      });

      expect(result.current.roadmapCompleted).toBe(true);
      expect(result.current.completionOpen).toBe(false);
    });

    it('replays the celebration when opening an already-finished roadmap', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, completedProgress);

      expect(result.current.roadmapCompleted).toBe(true);
      expect(result.current.completionOpen).toBe(true);
      // startedAt comes from the entry, finishedAt from the latest recorded check.
      expect(result.current.runTimes).toEqual({
        startedAt: '2026-07-15T09:00:00.000Z',
        finishedAt: '2026-07-15T09:45:00.000Z',
      });

      act(() => result.current.dismissCompletion());
      act(() => result.current.reopenCompletion());
      expect(result.current.completionOpen).toBe(true);
    });

    it('closes the screen and forgets the run times on restart', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, completedProgress);
      expect(result.current.completionOpen).toBe(true);

      fetchMock.mockResolvedValueOnce(jsonResponse(true, {}));
      await act(async () => {
        await result.current.resetProgress();
      });

      expect(result.current.completionOpen).toBe(false);
      expect(result.current.roadmapCompleted).toBe(false);
      expect(result.current.runTimes).toEqual({});
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

      act(() => result.current.revealNextHint());
      act(() => result.current.closeRoadmap());

      expect(result.current.roadmap).toBeNull();
      expect(result.current.resultsByStepId).toEqual({});
      expect(result.current.revealedHintsByStepId).toEqual({});
      expect(result.current.completedStepIds).toEqual({});
      expect(result.current.progressNotice).toBe(false);
      expect(result.current.currentStepIndex).toBe(0);
    });
  });

  describe('telemetry events', () => {
    const doneStep = { passed: true, attempts: 1, revealedHints: 0 };
    const halfDoneProgress: RoadmapProgressResponse = {
      projectId: 'p1',
      roadmapId: roadmap.id,
      steps: { 'create-web-server': doneStep },
    };
    const allDoneProgress: RoadmapProgressResponse = {
      projectId: 'p1',
      roadmapId: roadmap.id,
      steps: { 'create-web-server': doneStep, 'add-database': doneStep },
    };
    const failResponse: StepValidationResponse = {
      roadmapId: roadmap.id,
      stepId: 'create-web-server',
      stepPassed: false,
      results: [{ index: 0, type: 'container_running', status: 'fail', message: 'Not running.' }],
      checkedAt: '2026-07-15T10:00:00.000Z',
    };
    const errorResponse: StepValidationResponse = {
      roadmapId: roadmap.id,
      stepId: 'create-web-server',
      stepPassed: false,
      results: [{ index: 0, type: 'container_running', status: 'error', message: 'Docker down.' }],
      checkedAt: '2026-07-15T10:00:00.000Z',
    };

    it('fires first_validator_run once per install, whatever the verdict', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      fetchMock.mockResolvedValueOnce(jsonResponse(true, errorResponse));
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      expect(trackEventMock).toHaveBeenCalledWith('first_validator_run', {
        roadmap: roadmap.id,
        step: 'create-web-server',
      });

      fetchMock.mockResolvedValueOnce(jsonResponse(true, passResponse));
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      const firsts = trackEventMock.mock.calls.filter(([name]) => name === 'first_validator_run');
      expect(firsts).toHaveLength(1);
    });

    it('does not fire first_validator_run when the validation request itself fails', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: 'Docker down' }));
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      expect(trackEventMock).not.toHaveBeenCalledWith('first_validator_run', expect.anything());
    });

    it('fires roadmap_started when the persisted progress is empty', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);
      expect(trackEventMock).toHaveBeenCalledWith('roadmap_started', { roadmap: roadmap.id });
    });

    it('does not fire roadmap_started on a resumed run or an unreachable progress store', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, halfDoneProgress);

      fetchMock.mockResolvedValueOnce(jsonResponse(true, roadmap));
      fetchMock.mockRejectedValueOnce(new Error('network down'));
      await act(async () => {
        await result.current.openRoadmap({ id: roadmap.id, language: 'en' });
      });

      expect(trackEventMock).not.toHaveBeenCalledWith('roadmap_started', expect.anything());
    });

    it('fires step_validated on a pass and step_failed on a fail, never on an engine error', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      fetchMock.mockResolvedValueOnce(jsonResponse(true, failResponse));
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      expect(trackEventMock).toHaveBeenCalledWith('step_failed', {
        roadmap: roadmap.id,
        step: 'create-web-server',
      });

      fetchMock.mockResolvedValueOnce(jsonResponse(true, errorResponse));
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      expect(trackEventMock).not.toHaveBeenCalledWith('step_validated', expect.anything());

      fetchMock.mockResolvedValueOnce(jsonResponse(true, passResponse));
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      expect(trackEventMock).toHaveBeenCalledWith('step_validated', {
        roadmap: roadmap.id,
        step: 'create-web-server',
      });
    });

    it('fires roadmap_completed once, on the validation that completes the roadmap', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, halfDoneProgress);
      expect(result.current.currentStep?.id).toBe('add-database');

      fetchMock.mockResolvedValueOnce(jsonResponse(true, { ...passResponse, stepId: 'add-database' }));
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      expect(trackEventMock).toHaveBeenCalledWith('roadmap_completed', { roadmap: roadmap.id });

      // Re-validating a step of the already complete roadmap must not recount.
      fetchMock.mockResolvedValueOnce(jsonResponse(true, { ...passResponse, stepId: 'add-database' }));
      await act(async () => {
        await result.current.validateCurrentStep();
      });
      const completions = trackEventMock.mock.calls.filter(([name]) => name === 'roadmap_completed');
      expect(completions).toHaveLength(1);
    });

    it('fires roadmap_abandoned with keepalive when an unfinished roadmap is closed', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      act(() => result.current.closeRoadmap());

      expect(trackEventMock).toHaveBeenCalledWith(
        'roadmap_abandoned',
        { roadmap: roadmap.id, step: 'create-web-server' },
        { keepalive: true }
      );
    });

    it('does not fire roadmap_abandoned when the roadmap is complete', async () => {
      const { result } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock, allDoneProgress);

      act(() => result.current.closeRoadmap());

      expect(trackEventMock).not.toHaveBeenCalledWith(
        'roadmap_abandoned',
        expect.anything(),
        expect.anything()
      );
    });

    it('fires roadmap_abandoned exactly once on unmount with the player open', async () => {
      const { result, unmount } = renderHook(() => useLearningPlayer({ projectId: 'p1' }));
      await openExampleRoadmap(result, fetchMock);

      unmount();

      const abandons = trackEventMock.mock.calls.filter(([name]) => name === 'roadmap_abandoned');
      expect(abandons).toHaveLength(1);
    });
  });
});
