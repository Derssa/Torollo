import { useState, useCallback, useRef } from 'react';
import { API_BASE } from '../../../shared/types';
import type {
  Roadmap,
  RoadmapStep,
  RoadmapSummary,
  StepValidationResponse,
} from '../../../shared/types/roadmap';

interface UseLearningPlayerOptions {
  projectId: string;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * State of one roadmap play-through: the opened roadmap, the current step,
 * and the validation results per step. Everything lives in memory — losing
 * it on reload is the accepted P-1 scope; persistence is P-4.
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
  // React state updates are async, so `validating` alone cannot stop two
  // synchronous clicks — the ref is the actual double-submit guard.
  const validatingRef = useRef(false);

  const currentStep: RoadmapStep | null = roadmap?.steps[currentStepIndex] ?? null;

  const openRoadmap = useCallback(
    async ({ id, language }: Pick<RoadmapSummary, 'id' | 'language'>) => {
      try {
        setRoadmapLoading(true);
        setRoadmapError(null);
        const res = await fetch(
          `${API_BASE}/api/learning/roadmaps/${encodeURIComponent(id)}?language=${encodeURIComponent(language)}`
        );
        if (!res.ok) {
          setRoadmapError(await readErrorMessage(res, ''));
          return;
        }
        setRoadmap(await res.json());
        setCurrentStepIndex(0);
        setResultsByStepId({});
        setValidationError(null);
      } catch (err) {
        console.error('Failed to load roadmap:', err);
        setRoadmapError('');
      } finally {
        setRoadmapLoading(false);
      }
    },
    []
  );

  const closeRoadmap = useCallback(() => {
    setRoadmap(null);
    setRoadmapError(null);
    setCurrentStepIndex(0);
    setResultsByStepId({});
    setValidationError(null);
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      if (!roadmap) return;
      setCurrentStepIndex(Math.max(0, Math.min(index, roadmap.steps.length - 1)));
      // A transport error is about the attempt, not the step; results stay.
      setValidationError(null);
    },
    [roadmap]
  );

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
  };
}
