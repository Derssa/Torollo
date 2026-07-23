import { useCallback, useState } from 'react';
import { API_BASE } from '../../../shared/types';
import type { ProgressEntrySummary, ProgressListResponse } from '../../../shared/types/roadmap';

/**
 * Loads every roadmap play-through summary (GET /api/learning/progress) and
 * keeps the most recent entry per roadmap — the landing page shows one
 * "Continue" per roadmap, pointing at the project it was last played in.
 * Progress is a garnish there: on error the cards simply render without it,
 * so this hook exposes the flag but callers should not fail the section.
 */
export function useLearningProgressSummaries() {
  const [byRoadmapId, setByRoadmapId] = useState<Record<string, ProgressEntrySummary>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch(`${API_BASE}/api/learning/progress`);
      const data: ProgressListResponse = await res.json();
      if (res.ok && Array.isArray(data?.entries)) {
        const latest: Record<string, ProgressEntrySummary> = {};
        for (const entry of data.entries) {
          const current = latest[entry.roadmapId];
          if (!current || entry.updatedAt > current.updatedAt) {
            latest[entry.roadmapId] = entry;
          }
        }
        setByRoadmapId(latest);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('Failed to fetch learning progress:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  return { byRoadmapId, loading, error, fetchProgress };
}
