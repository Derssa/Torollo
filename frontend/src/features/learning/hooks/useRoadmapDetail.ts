import { useCallback, useRef, useState } from 'react';
import { API_BASE } from '../../../shared/types';
import type {
  Roadmap,
  RoadmapProgressResponse,
  RoadmapSummary,
  StepProgress,
} from '../../../shared/types/roadmap';

interface FetchArgs extends Pick<RoadmapSummary, 'id' | 'language'> {
  /** Project the roadmap was last played in, when it has been played. */
  projectId?: string;
}

/**
 * Loads everything the roadmap briefing page shows: the full roadmap
 * (GET /api/learning/roadmaps/:id) and, when the roadmap has already been
 * played, that play-through's per-step progress.
 *
 * The roadmap is the page; its progress is a garnish, so a failing progress
 * request leaves the page rendered without ticks rather than erroring out —
 * same policy as useLearningProgressSummaries.
 */
export function useRoadmapDetail() {
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [stepProgress, setStepProgress] = useState<Record<string, StepProgress>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Switching language (or roadmap) while a request is in flight races on
  // resolution order; only the latest request may commit.
  const seqRef = useRef(0);

  const fetchDetail = useCallback(async ({ id, language, projectId }: FetchArgs) => {
    const seq = ++seqRef.current;
    try {
      setLoading(true);
      setError(false);
      const res = await fetch(
        `${API_BASE}/api/learning/roadmaps/${encodeURIComponent(id)}?language=${encodeURIComponent(language)}`
      );
      const data = await res.json();
      if (seq !== seqRef.current) return;
      if (!res.ok || !Array.isArray(data?.steps) || data.steps.length === 0) {
        setError(true);
        return;
      }

      let steps: Record<string, StepProgress> = {};
      if (projectId) {
        try {
          const progressRes = await fetch(
            `${API_BASE}/api/learning/progress/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`
          );
          if (progressRes.ok) {
            const progress: RoadmapProgressResponse = await progressRes.json();
            steps = progress.steps ?? {};
          }
        } catch (err) {
          console.error('Failed to load roadmap progress:', err);
        }
      }
      if (seq !== seqRef.current) return;

      setRoadmap(data as Roadmap);
      setStepProgress(steps);
    } catch (err) {
      console.error('Failed to load roadmap:', err);
      if (seq === seqRef.current) setError(true);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  return { roadmap, stepProgress, loading, error, fetchDetail };
}
