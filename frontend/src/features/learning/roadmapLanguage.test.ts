import { describe, it, expect } from 'vitest';
import { filterByUiLanguage } from './roadmapLanguage';
import type { RoadmapSummary } from '../../shared/types/roadmap';

function summary(overrides: Partial<RoadmapSummary>): RoadmapSummary {
  return {
    id: 'some-roadmap',
    title: 'Some roadmap',
    description: 'Description.',
    language: 'en',
    stepCount: 3,
    source: 'builtin',
    ...overrides,
  };
}

describe('filterByUiLanguage', () => {
  it('keeps only roadmaps authored in the active UI language', () => {
    const kept = filterByUiLanguage(
      [summary({ id: 'a-roadmap', language: 'en' }), summary({ id: 'b-roadmap', language: 'fr' })],
      'en'
    );

    expect(kept.map(s => s.id)).toEqual(['a-roadmap']);
  });

  it('matches on the base subtag — en-US still sees an en roadmap', () => {
    const kept = filterByUiLanguage([summary({ language: 'en' })], 'en-US');

    expect(kept).toHaveLength(1);
  });

  it('always keeps imported roadmaps, whatever their language — an import must never silently vanish', () => {
    const kept = filterByUiLanguage(
      [
        summary({ id: 'pack-roadmap', language: 'en', source: 'imported' }),
        summary({ id: 'shipped-roadmap', language: 'en', source: 'builtin' }),
      ],
      'fr'
    );

    expect(kept.map(s => s.id)).toEqual(['pack-roadmap']);
  });

  it('treats an absent source as builtin (older payloads)', () => {
    const kept = filterByUiLanguage([summary({ language: 'en', source: undefined })], 'fr');

    expect(kept).toEqual([]);
  });
});
