import path from 'path';
import { CURATED_ROADMAP_ORDER, RoadmapService } from './roadmapService';

const FIXTURES_DIR = path.resolve(__dirname, '__fixtures__/roadmaps');
const USER_FIXTURES_DIR = path.resolve(__dirname, '__fixtures__/user-roadmaps');
// The normal state before the first import: the user directory does not exist.
const NO_USER_DIR = path.resolve(__dirname, '__fixtures__/no-such-user-roadmaps');

const dirs = { dir: FIXTURES_DIR, userDir: NO_USER_DIR };

describe('RoadmapService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('listRoadmaps', () => {
    it('lists one summary per file — translations appear as separate entries', () => {
      const summaries = RoadmapService.listRoadmaps(dirs);

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
          source: 'builtin',
        },
        {
          id: 'fixture-roadmap',
          title: 'Fixture roadmap',
          description: 'A minimal valid roadmap used by roadmapService tests.',
          language: 'en',
          difficulty: 'beginner',
          estimatedMinutes: 10,
          stepCount: 2,
          source: 'builtin',
        },
        {
          id: 'zz-unlisted-roadmap',
          title: 'Unlisted roadmap',
          description: 'Sorts first by file name, last by id: proves the catalogue orders on ids.',
          language: 'en',
          difficulty: 'beginner',
          estimatedMinutes: 5,
          stepCount: 1,
          source: 'builtin',
        },
      ]);
    });

    it('orders roadmaps outside the curated list by id, not by file name', () => {
      const ids = RoadmapService.listRoadmaps(dirs).map(summary => summary.id);

      // a-unlisted-id.json holds `zz-unlisted-roadmap`: file name first, id last.
      expect(ids).toEqual(['fixture-roadmap', 'fixture-roadmap', 'zz-unlisted-roadmap']);
    });

    it('opens the shipped catalogue on the curated order — the first entry is what a first-run user is pitched', () => {
      const summaries = RoadmapService.listRoadmaps({ userDir: NO_USER_DIR });
      const curated = summaries.map(s => s.id).filter(id => CURATED_ROADMAP_ORDER.includes(id));
      // Translations share an id and sit next to each other: collapse the runs.
      const distinct = curated.filter((id, index) => id !== curated[index - 1]);

      expect(summaries[0].id).toBe(CURATED_ROADMAP_ORDER[0]);
      expect(distinct).toEqual(CURATED_ROADMAP_ORDER.filter(id => curated.includes(id)));
    });

    it('skips invalid roadmap files and warns with the file name', () => {
      RoadmapService.listRoadmaps(dirs);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('invalid-missing-title.json')
      );
    });

    it('returns an empty list when the shipped directory does not exist', () => {
      expect(
        RoadmapService.listRoadmaps({ dir: path.join(FIXTURES_DIR, 'nope'), userDir: NO_USER_DIR })
      ).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('does not warn about a missing user directory — that is the pre-first-import state', () => {
      RoadmapService.listRoadmaps(dirs);

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('no-such-user-roadmaps'));
    });

    it('merges the user directory into the catalogue, marked as imported', () => {
      const summaries = RoadmapService.listRoadmaps({ dir: FIXTURES_DIR, userDir: USER_FIXTURES_DIR });
      const imported = summaries.find(s => s.id === 'imported-roadmap');

      expect(imported).toMatchObject({
        title: 'Imported roadmap',
        language: 'en',
        source: 'imported',
      });
    });

    it('lets a shipped roadmap win over an imported file with the same (id, language)', () => {
      const summaries = RoadmapService.listRoadmaps({ dir: FIXTURES_DIR, userDir: USER_FIXTURES_DIR });
      const fixtureEn = summaries.filter(s => s.id === 'fixture-roadmap' && s.language === 'en');

      expect(fixtureEn).toEqual([
        expect.objectContaining({ title: 'Fixture roadmap', source: 'builtin' }),
      ]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('collides with a shipped roadmap'));
    });
  });

  describe('getRoadmap', () => {
    it('returns the full roadmap for a known id', () => {
      const roadmap = RoadmapService.getRoadmap('fixture-roadmap', dirs);

      expect(roadmap).not.toBeNull();
      expect(roadmap?.steps.map(s => s.id)).toEqual(['start-web', 'start-db']);
    });

    it('picks deterministically (sorted by language) when no language is given', () => {
      const first = RoadmapService.getRoadmap('fixture-roadmap', dirs);
      const second = RoadmapService.getRoadmap('fixture-roadmap', dirs);

      expect(first?.language).toBe('en');
      expect(second?.language).toBe('en');
    });

    it('returns the exact translation when a language is given', () => {
      const roadmap = RoadmapService.getRoadmap('fixture-roadmap', { language: 'fr', ...dirs });

      expect(roadmap?.language).toBe('fr');
      expect(roadmap?.title).toBe('Roadmap de test');
    });

    it('returns null for a language with no translation — no fallback', () => {
      expect(RoadmapService.getRoadmap('fixture-roadmap', { language: 'de', ...dirs })).toBeNull();
    });

    it('returns null for an unknown id', () => {
      expect(RoadmapService.getRoadmap('does-not-exist', dirs)).toBeNull();
    });

    it('never serves a roadmap from an invalid file', () => {
      expect(RoadmapService.getRoadmap('broken-roadmap', dirs)).toBeNull();
    });

    it('serves an imported roadmap exactly like a shipped one', () => {
      const roadmap = RoadmapService.getRoadmap('imported-roadmap', {
        dir: FIXTURES_DIR,
        userDir: USER_FIXTURES_DIR,
      });

      expect(roadmap?.steps.map(s => s.id)).toEqual(['start-cache']);
    });

    it('never serves the imported file when a shipped roadmap has the same (id, language)', () => {
      const roadmap = RoadmapService.getRoadmap('fixture-roadmap', {
        language: 'en',
        dir: FIXTURES_DIR,
        userDir: USER_FIXTURES_DIR,
      });

      expect(roadmap?.title).toBe('Fixture roadmap');
    });
  });
});
