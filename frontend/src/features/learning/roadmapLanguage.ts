import type { RoadmapSummary } from '../../shared/types/roadmap';

/**
 * Only surface roadmaps authored in the active UI language: an English user
 * sees English roadmaps only. Compare on the base subtag so 'en-US' still
 * matches an 'en' roadmap.
 *
 * Imported roadmaps are exempt: the user chose to install them, so hiding
 * one because it isn't authored in the UI language would make an import
 * silently vanish. Their card shows the language instead.
 */
export function filterByUiLanguage(
  summaries: RoadmapSummary[],
  uiLanguage: string
): RoadmapSummary[] {
  const base = uiLanguage.split('-')[0];
  return summaries.filter(
    summary => summary.source === 'imported' || summary.language.split('-')[0] === base
  );
}
