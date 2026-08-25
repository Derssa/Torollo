import { useState, useCallback, useEffect, useRef } from 'react';
import { API_BASE } from '../../../shared/types';
import { readErrorMessage } from '../../../shared/utils/readErrorMessage';
import { trackEvent } from '../../telemetry/telemetry';
import { claimMilestone } from '../../telemetry/milestones';
import { stepOutcome } from '../validationStatus';
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

/** Start/end timestamps of a play-through, for the completion receipt. */
export interface RunTimes {
  /** When the backend created the progress entry — absent for runs that predate the field. */
  startedAt?: string;
  /** Latest recorded validation once the roadmap is complete. */
  finishedAt?: string;
}

/** Most recent validation across the persisted steps, ISO-comparable strings. */
function latestCheck(steps: RoadmapStep[], progressSteps: Record<string, StepProgress>): string | undefined {
  let latest: string | undefined;
  for (const step of steps) {
    const checkedAt = progressSteps[step.id]?.lastCheckedAt;
    if (checkedAt && (!latest || checkedAt > latest)) latest = checkedAt;
  }
  return latest;
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
  // The completion screen is an explicit screen state, not a derived one:
  // it opens on the two celebration moments (a validation that completes the
  // roadmap, opening an already-finished roadmap) and stays dismissable.
  const [completionOpen, setCompletionOpen] = useState(false);
  const [runTimes, setRunTimes] = useState<RunTimes>({});
  // React state updates are async, so `validating` alone cannot stop two
  // synchronous clicks — the ref is the actual double-submit guard.
  const validatingRef = useRef(false);
  // Two quick openRoadmap clicks race on fetch resolution order; only the
  // latest request is allowed to commit its result.
  const openSeqRef = useRef(0);
  // Telemetry: the open play-through, read by the abandon paths (close,
  // unmount, pagehide) — a ref so those handlers see the latest state.
  const telemetrySessionRef = useRef<{ roadmapId: string; stepId: string; complete: boolean } | null>(
    null
  );

  const currentStep: RoadmapStep | null = roadmap?.steps[currentStepIndex] ?? null;

  useEffect(() => {
    if (!roadmap || !currentStep) {
      telemetrySessionRef.current = null;
      return;
    }
    telemetrySessionRef.current = {
      roadmapId: roadmap.id,
      stepId: currentStep.id,
      complete: roadmap.steps.every(
        step => completedStepIds[step.id] || resultsByStepId[step.id]?.stepPassed
      ),
    };
  }, [roadmap, currentStep, completedStepIds, resultsByStepId]);

  // Leaving an unfinished roadmap is the abandon event, whatever the exit:
  // closing the player, unmounting it, or closing/refreshing the whole tab.
  // Nulling the ref makes the event once-per-play-through — close followed by
  // unmount must not double-count.
  const fireAbandon = useCallback(() => {
    const session = telemetrySessionRef.current;
    if (!session || session.complete) return;
    telemetrySessionRef.current = null;
    trackEvent(
      'roadmap_abandoned',
      { roadmap: session.roadmapId, step: session.stepId },
      { keepalive: true }
    );
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', fireAbandon);
    return () => {
      window.removeEventListener('pagehide', fireAbandon);
      fireAbandon();
    };
  }, [fireAbandon]);

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
        let startedAt: string | undefined;
        let recovered = false;
        let progressLoaded = false;
        try {
          const progressRes = await fetch(progressUrl(data.id));
          if (progressRes.ok) {
            const progress: RoadmapProgressResponse = await progressRes.json();
            progressSteps = progress.steps ?? {};
            startedAt = progress.startedAt;
            recovered = progress.storeRecovered === true;
            progressLoaded = true;
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
        // Revisiting a finished roadmap replays the celebration: the screen
        // is where "next roadmap" and the share action live, so it must stay
        // reachable after the win — not be a one-shot.
        const allComplete = firstIncomplete === -1;

        setRoadmap(data);
        setCurrentStepIndex(allComplete ? steps.length - 1 : firstIncomplete);
        setResultsByStepId({});
        setRevealedHintsByStepId(revealed);
        setCompletedStepIds(completed);
        setProgressNotice(recovered);
        setValidationError(null);
        setResetError(null);
        setCompletionOpen(allComplete);
        setRunTimes({
          startedAt,
          finishedAt: allComplete ? latestCheck(steps, progressSteps) : undefined,
        });

        // A confirmed-empty progress store is what "started" means; a failed
        // progress fetch could be a resumed run, so it never counts as one.
        if (progressLoaded && Object.keys(progressSteps).length === 0) {
          trackEvent('roadmap_started', { roadmap: data.id });
        }
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
    fireAbandon();
    setRoadmap(null);
    setRoadmapError(null);
    setCurrentStepIndex(0);
    setResultsByStepId({});
    setRevealedHintsByStepId({});
    setCompletedStepIds({});
    setProgressNotice(false);
    setValidationError(null);
    setResetError(null);
    setCompletionOpen(false);
    setRunTimes({});
  }, [fireAbandon]);

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

      // The install's first-ever validation, whatever its verdict: the moment
      // the learner has crossed setup and is actually using the engine.
      if (claimMilestone('first_validator_run')) {
        trackEvent('first_validator_run', { roadmap: roadmap.id, step: currentStep.id });
      }

      // An engine error is not a pedagogical failure — it is not counted.
      const outcome = stepOutcome(response);
      if (outcome !== 'error') {
        trackEvent(outcome === 'passed' ? 'step_validated' : 'step_failed', {
          roadmap: roadmap.id,
          step: currentStep.id,
        });
      }

      // Fresh completion only — this verdict turned the last missing step
      // green. Only the transition counts and celebrates: re-validating a
      // step of an already complete roadmap must not report the roadmap as
      // completed again nor reopen the screen over the learner's work.
      const stepDone = (step: RoadmapStep) =>
        completedStepIds[step.id] || resultsByStepId[step.id]?.stepPassed;
      const wasComplete = roadmap.steps.every(stepDone);
      const nowComplete =
        response.stepPassed && roadmap.steps.every(step => step.id === currentStep.id || stepDone(step));
      if (nowComplete && !wasComplete) {
        trackEvent('roadmap_completed', { roadmap: roadmap.id });
        setCompletionOpen(true);
        setRunTimes(prev => ({ ...prev, finishedAt: response.checkedAt }));
        // The run may have started this session, after the open-time
        // hydration: the validate call just persisted the entry, so a
        // refetch is guaranteed to know when the play-through began.
        fetch(progressUrl(roadmap.id))
          .then(progressRes => (progressRes.ok ? progressRes.json() : null))
          .then((progress: RoadmapProgressResponse | null) => {
            if (progress?.startedAt) {
              setRunTimes(prev => ({ ...prev, startedAt: progress.startedAt }));
            }
          })
          .catch(err => console.error('Failed to refresh roadmap progress:', err));
      }
    } catch (err) {
      console.error('Failed to validate step:', err);
      setValidationError('');
    } finally {
      validatingRef.current = false;
      setValidating(false);
    }
  }, [projectId, roadmap, currentStep, completedStepIds, resultsByStepId, progressUrl]);

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
      setCompletionOpen(false);
      setRunTimes({});
    } catch (err) {
      console.error('Failed to reset roadmap progress:', err);
      setResetError('');
    } finally {
      setResetting(false);
    }
  }, [resetting, roadmap, progressUrl]);

  const dismissProgressNotice = useCallback(() => setProgressNotice(false), []);

  const dismissCompletion = useCallback(() => setCompletionOpen(false), []);
  const reopenCompletion = useCallback(() => setCompletionOpen(true), []);

  // Achievement, not navigation: true as soon as every step is green, whether
  // it was earned this session or restored from persisted progress.
  const roadmapCompleted =
    roadmap !== null &&
    roadmap.steps.every(step => completedStepIds[step.id] || resultsByStepId[step.id]?.stepPassed);

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
    roadmapCompleted,
    completionOpen,
    dismissCompletion,
    reopenCompletion,
    runTimes,
  };
}
