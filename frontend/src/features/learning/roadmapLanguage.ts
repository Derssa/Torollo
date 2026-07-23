import type { RoadmapSummary } from '../../shared/types/roadmap';

/**
 * Only surface roadmaps authored in the active UI language: an English user
 * sees English roadmaps only. Compare on the base subtag so 'en-US' still
 * matches an 'en' roadmap.
 */
export function filterByUiLanguage(
  summaries: RoadmapSummary[],
  uiLanguage: string
): RoadmapSummary[] {
  const base = uiLanguage.split('-')[0];
  return summaries.filter(summary => summary.language.split('-')[0] === base);
}
