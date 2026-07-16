import { useState, useCallback, useRef } from 'react';
import { API_BASE } from '../../../shared/types';
import { readErrorMessage } from '../../../shared/utils/readErrorMessage';
import type {
  Roadmap,
  RoadmapProgressResponse,
  RoadmapStep,
  RoadmapSummary,
  StepProgress,
  StepValidationResponse,
} from '../../../shared/types/roadmap';

interface UseLearningPlayerOptions {
  projectId: string;
}

/** Revealed rungs on a step's hint ladder [...hints, solution?]. */
function ladderLength(step: RoadmapStep): number {
  return (step.hints?.length ?? 0) + (step.solution ? 1 : 0);
}

/**
 * State of one roadmap play-through: the opened roadmap, the current step,
 * and the validation results per step.
 *
 * Progression (completed steps, revealed hints, attempts) is persisted by the
 * backend per (project, roadmap) and survives restarts: validation attempts
 * are recorded server-side by POST /validate itself, hint reveals are pushed
 * here fire-and-forget, and openRoadmap hydrates everything back. Validator
 * results are the exception — they describe a past container state, so they
 * are session-only and a restored completed step just shows its ✓ marker.
 *
 * Error fields hold the server-provided message when there is one, or ''
 * for a generic failure (network down) — the component falls back to an
 * i18n label so the hook stays translation-free.
 */
export function useLearningPlayer({ projectId }: UseLearningPlayerOptions) {
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapError, setRoadmapError] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [resultsByStepId, setResultsByStepId] = useState<Record<string, StepValidationResponse>>({});
  const [revealedHintsByStepId, setRevealedHintsByStepId] = useState<Record<string, number>>({});
  // Steps whose latest recorded validation passed — hydrated from persisted
  // progress on open. Session results take display precedence over it.
  const [completedStepIds, setCompletedStepIds] = useState<Record<string, boolean>>({});
  // True when the backend had to discard an unreadable progress store: the
  // learner must be told their saved progression was lost, not left guessing.
  const [progressNotice, setProgressNotice] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // React state updates are async, so `validating` alone cannot stop two
  // synchronous clicks — the ref is the actual double-submit guard.
  const validatingRef = useRef(false);
  // Two quick openRoadmap clicks race on fetch resolution order; only the
  // latest request is allowed to commit its result.
  const openSeqRef = useRef(0);

  const currentStep: RoadmapStep | null = roadmap?.steps[currentStepIndex] ?? null;

  const progressUrl = useCallback(
    (roadmapId: string) =>
      `${API_BASE}/api/learning/progress/${encodeURIComponent(projectId)}/${encodeURIComponent(roadmapId)}`,
    [projectId]
  );

  const openRoadmap = useCallback(
    async ({ id, language }: Pick<RoadmapSummary, 'id' | 'language'>) => {
      const seq = ++openSeqRef.current;
      try {
        setRoadmapLoading(true);
        setRoadmapError(null);
        const res = await fetch(
          `${API_BASE}/api/learning/roadmaps/${encodeURIComponent(id)}?language=${encodeURIComponent(language)}`
        );
        if (seq !== openSeqRef.current) return;
        if (!res.ok) {
          setRoadmapError(await readErrorMessage(res, ''));
          return;
        }
        const data = await res.json();
        if (seq !== openSeqRef.current) return;
        if (!Array.isArray(data?.steps) || data.steps.length === 0) {
          setRoadmapError('');
          return;
        }

        // Hydrate persisted progress before committing anything, so the
        // player opens directly on the restored step — no blank-state flash.
        // Progress is a convenience: if it can't be read, open fresh anyway.
        let progressSteps: Record<string, StepProgress> = {};
        let recovered = false;
        try {
          const progressRes = await fetch(progressUrl(data.id));
          if (progressRes.ok) {
            const progress: RoadmapProgressResponse = await progressRes.json();
            progressSteps = progress.steps ?? {};
            recovered = progress.storeRecovered === true;
          } else {
            console.error('Failed to load roadmap progress: HTTP', progressRes.status);
          }
        } catch (err) {
          console.error('Failed to load roadmap progress:', err);
        }
        if (seq !== openSeqRef.current) return;

        const steps = data.steps as RoadmapStep[];
        const completed: Record<string, boolean> = {};
        const revealed: Record<string, number> = {};
        // Walking the roadmap's steps (not the stored keys) drops progress of
        // step ids that no longer exist in the file.
        for (const step of steps) {
          const stepProgress = progressSteps[step.id];
          if (!stepProgress) continue;
          if (stepProgress.passed) completed[step.id] = true;
          if (stepProgress.revealedHints > 0) {
            revealed[step.id] = Math.min(stepProgress.revealedHints, ladderLength(step));
          }
        }
        const firstIncomplete = steps.findIndex(step => !completed[step.id]);

        setRoadmap(data);
        setCurrentStepIndex(firstIncomplete === -1 ? steps.length - 1 : firstIncomplete);
        setResultsByStepId({});
        setRevealedHintsByStepId(revealed);
        setCompletedStepIds(completed);
        setProgressNotice(recovered);
        setValidationError(null);
        setResetError(null);
      } catch (err) {
        console.error('Failed to load roadmap:', err);
        if (seq === openSeqRef.current) setRoadmapError('');
      } finally {
        if (seq === openSeqRef.current) setRoadmapLoading(false);
      }
    },
    [progressUrl]
  );

  const closeRoadmap = useCallback(() => {
    setRoadmap(null);
    setRoadmapError(null);
    setCurrentStepIndex(0);
    setResultsByStepId({});
    setRevealedHintsByStepId({});
    setCompletedStepIds({});
    setProgressNotice(false);
    setValidationError(null);
    setResetError(null);
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      if (!roadmap) return;
      setCurrentStepIndex(Math.max(0, Math.min(index, roadmap.steps.length - 1)));
      // A transport error is about the attempt, not the step; results stay.
      setValidationError(null);
      setResetError(null);
    },
    [roadmap]
  );

  const revealNextHint = useCallback(() => {
    if (!roadmap || !currentStep) return;
    // Sequential reveal only: one more rung per call, clamped to the ladder
    // length so a stray extra click can never jump past the solution.
    const next = Math.min((revealedHintsByStepId[currentStep.id] ?? 0) + 1, ladderLength(currentStep));
    setRevealedHintsByStepId(prev => ({ ...prev, [currentStep.id]: next }));
    // Fire-and-forget, absolute count: a reveal must never block on the
    // network, and a lost write self-heals on the next one.
    fetch(`${progressUrl(roadmap.id)}/hints`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepId: currentStep.id, revealedHints: next }),
    }).catch(err => console.error('Failed to save revealed hints:', err));
  }, [roadmap, currentStep, revealedHintsByStepId, progressUrl]);

  const validateCurrentStep = useCallback(async () => {
    if (validatingRef.current || !roadmap || !currentStep) return;
    validatingRef.current = true;
    try {
      setValidating(true);
      setValidationError(null);
      const res = await fetch(`${API_BASE}/api/learning/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, roadmapId: roadmap.id, stepId: currentStep.id }),
      });
      if (!res.ok) {
        // Per the learning API contract, 4xx/5xx mean the request was wrong
        // or the server crashed — never "the learner hasn't finished".
        setValidationError(await readErrorMessage(res, ''));
        return;
      }
      const response: StepValidationResponse = await res.json();
      setResultsByStepId(prev => ({ ...prev, [currentStep.id]: response }));
    } catch (err) {
      console.error('Failed to validate step:', err);
      setValidationError('');
    } finally {
      validatingRef.current = false;
      setValidating(false);
    }
  }, [projectId, roadmap, currentStep]);

  /** Forgets this roadmap's persisted progress and restarts it from step 1. */
  const resetProgress = useCallback(async () => {
    if (resetting || !roadmap) return;
    try {
      setResetting(true);
      setResetError(null);
      const res = await fetch(progressUrl(roadmap.id), { method: 'DELETE' });
      if (!res.ok) {
        setResetError(await readErrorMessage(res, ''));
        return;
      }
      setCurrentStepIndex(0);
      setResultsByStepId({});
      setRevealedHintsByStepId({});
      setCompletedStepIds({});
      setProgressNotice(false);
      setValidationError(null);
    } catch (err) {
      console.error('Failed to reset roadmap progress:', err);
      setResetError('');
    } finally {
      setResetting(false);
    }
  }, [resetting, roadmap, progressUrl]);

  const dismissProgressNotice = useCallback(() => setProgressNotice(false), []);

  return {
    roadmap,
    roadmapLoading,
    roadmapError,
    openRoadmap,
    closeRoadmap,
    currentStepIndex,
    currentStep,
    goToStep,
    validating,
    validationError,
    resultsByStepId,
    validateCurrentStep,
    revealedHintsByStepId,
    revealNextHint,
    completedStepIds,
    progressNotice,
    dismissProgressNotice,
    resetProgress,
    resetting,
    resetError,
  };
}
