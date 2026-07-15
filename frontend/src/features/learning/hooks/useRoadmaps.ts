import { useState, useCallback } from 'react';
import { API_BASE } from '../../../shared/types';
import type { RoadmapSummary } from '../../../shared/types/roadmap';

/**
 * Loads the roadmap catalogue (GET /api/learning/roadmaps).
 * The caller triggers the initial fetch (mount effect) and retries by
 * calling `fetchRoadmaps` again — same pattern as useContainers.
 */
export function useRoadmaps() {
  const [summaries, setSummaries] = useState<RoadmapSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchRoadmaps = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch(`${API_BASE}/api/learning/roadmaps`);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setSummaries(data);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('Failed to fetch roadmaps:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  return { summaries, loading, error, fetchRoadmaps };
}
