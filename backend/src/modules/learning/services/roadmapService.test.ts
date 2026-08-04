import path from 'path';
import { CURATED_ROADMAP_ORDER, RoadmapService } from './roadmapService';

const FIXTURES_DIR = path.resolve(__dirname, '__fixtures__/roadmaps');

describe('RoadmapService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('listRoadmaps', () => {
    it('lists one summary per file — translations appear as separate entries', () => {
      const summaries = RoadmapService.listRoadmaps(FIXTURES_DIR);

      expect(summaries).toEqual([
        {
          id: 'fixture-roadmap',
          title: 'Roadmap de test',
          description:
            'Traduction française de la roadmap de test — même id, langue différente.',
          language: 'fr',
          difficulty: 'beginner',
          estimatedMinutes: 10,
          stepCount: 2,
        },
        {
          id: 'fixture-roadmap',
          title: 'Fixture roadmap',
          description: 'A minimal valid roadmap used by roadmapService tests.',
          language: 'en',
          difficulty: 'beginner',
          estimatedMinutes: 10,
          stepCount: 2,
        },
        {
          id: 'zz-unlisted-roadmap',
          title: 'Unlisted roadmap',
          description: 'Sorts first by file name, last by id: proves the catalogue orders on ids.',
          language: 'en',
          difficulty: 'beginner',
          estimatedMinutes: 5,
          stepCount: 1,
        },
      ]);
    });

    it('orders roadmaps outside the curated list by id, not by file name', () => {
      const ids = RoadmapService.listRoadmaps(FIXTURES_DIR).map(summary => summary.id);

      // a-unlisted-id.json holds `zz-unlisted-roadmap`: file name first, id last.
      expect(ids).toEqual(['fixture-roadmap', 'fixture-roadmap', 'zz-unlisted-roadmap']);
    });

    it('opens the shipped catalogue on the curated order — the first entry is what a first-run user is pitched', () => {
      const summaries = RoadmapService.listRoadmaps();
      const curated = summaries.map(s => s.id).filter(id => CURATED_ROADMAP_ORDER.includes(id));
      // Translations share an id and sit next to each other: collapse the runs.
      const distinct = curated.filter((id, index) => id !== curated[index - 1]);

      expect(summaries[0].id).toBe(CURATED_ROADMAP_ORDER[0]);
      expect(distinct).toEqual(CURATED_ROADMAP_ORDER.filter(id => curated.includes(id)));
    });

    it('skips invalid roadmap files and warns with the file name', () => {
      RoadmapService.listRoadmaps(FIXTURES_DIR);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('invalid-missing-title.json')
      );
    });

    it('returns an empty list when the directory does not exist', () => {
      expect(RoadmapService.listRoadmaps(path.join(FIXTURES_DIR, 'nope'))).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
  });

  describe('getRoadmap', () => {
    it('returns the full roadmap for a known id', () => {
      const roadmap = RoadmapService.getRoadmap('fixture-roadmap', { dir: FIXTURES_DIR });

      expect(roadmap).not.toBeNull();
      expect(roadmap?.steps.map(s => s.id)).toEqual(['start-web', 'start-db']);
    });

    it('picks deterministically (sorted by language) when no language is given', () => {
      const first = RoadmapService.getRoadmap('fixture-roadmap', { dir: FIXTURES_DIR });
      const second = RoadmapService.getRoadmap('fixture-roadmap', { dir: FIXTURES_DIR });

      expect(first?.language).toBe('en');
      expect(second?.language).toBe('en');
    });

    it('returns the exact translation when a language is given', () => {
      const roadmap = RoadmapService.getRoadmap('fixture-roadmap', {
        language: 'fr',
        dir: FIXTURES_DIR,
      });

      expect(roadmap?.language).toBe('fr');
      expect(roadmap?.title).toBe('Roadmap de test');
    });

    it('returns null for a language with no translation — no fallback', () => {
      expect(
        RoadmapService.getRoadmap('fixture-roadmap', { language: 'de', dir: FIXTURES_DIR })
      ).toBeNull();
    });

    it('returns null for an unknown id', () => {
      expect(RoadmapService.getRoadmap('does-not-exist', { dir: FIXTURES_DIR })).toBeNull();
    });

    it('never serves a roadmap from an invalid file', () => {
      expect(RoadmapService.getRoadmap('broken-roadmap', { dir: FIXTURES_DIR })).toBeNull();
    });
  });
});
