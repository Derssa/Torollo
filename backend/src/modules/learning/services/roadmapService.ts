import fs from 'fs';
import os from 'os';
import path from 'path';
import { Roadmap, RoadmapDifficulty } from '../format/roadmapTypes';
import { validateRoadmap } from '../format/validateRoadmap';

/** Where a catalogue entry comes from: shipped with Torollo, or imported by the user. */
export type RoadmapSource = 'builtin' | 'imported';

/** What the roadmap catalogue exposes to the frontend (GET /api/learning/roadmaps). */
export interface RoadmapSummary {
  id: string;
  title: string;
  description: string;
  language: string;
  difficulty?: RoadmapDifficulty;
  estimatedMinutes?: number;
  stepCount: number;
  source: RoadmapSource;
}

// Resolved from this file, never from process.cwd(): the CLI spawns the server
// without a cwd, and dist/ mirrors src/ so the same hops work in dev and prod.
// services/ → learning → modules → src|dist → backend → repo root.
const ROADMAPS_DIR = path.resolve(__dirname, '../../../../../roadmaps');

// User-imported roadmaps live next to the other per-user state
// (projects.json, progress.json). Re-scanned on every call like the shipped
// directory, so dropping a file here by hand works as well as the import
// endpoint does.
export const USER_ROADMAPS_DIR = path.join(os.homedir(), '.torollo', 'roadmaps');

/**
 * The catalogue is a suggested path, not a directory listing: this is the order
 * the shipped roadmaps are meant to be taken in, and its first entry is the one
 * a first-run user is pitched on the landing page. Without it the order would
 * fall back to file names — alphabetical, which pitches whichever roadmap
 * happens to sort first.
 *
 * Roadmaps that are not listed here (community files dropped into `roadmaps/`,
 * imported roadmaps) follow, ordered by id. Ids that no longer exist are
 * simply ignored.
 */
export const CURATED_ROADMAP_ORDER = [
  'resilient-three-tier',
  'cache-aside-redis',
  'redis-queue-workers',
];

/** Directories the catalogue reads — overridden in tests only. */
export interface RoadmapDirs {
  dir?: string;
  userDir?: string;
}

interface SourcedRoadmap {
  roadmap: Roadmap;
  source: RoadmapSource;
}

/**
 * Loads roadmap files (format v1) from the shipped roadmaps/ directory and
 * from the user's import directory (~/.torollo/roadmaps/).
 *
 * Files are re-read on every call — they are a few kB, requested at human
 * frequency, and this gives roadmap authors hot reload for free. A file that
 * is not valid JSON or does not pass the format schema is logged and skipped,
 * never served.
 */
export class RoadmapService {
  public static listRoadmaps(dirs: RoadmapDirs = {}): RoadmapSummary[] {
    return this.readAll(dirs)
      .map(({ roadmap, source }) => ({
        id: roadmap.id,
        title: roadmap.title,
        description: roadmap.description,
        language: roadmap.language,
        difficulty: roadmap.difficulty,
        estimatedMinutes: roadmap.estimatedMinutes,
        stepCount: roadmap.steps.length,
        source,
      }))
      // Curated order first, then unlisted ids by id. Translations of one id
      // compare equal and keep the file-name order readAll() guarantees, so
      // the whole list stays deterministic.
      .sort((a, b) => this.catalogueRank(a.id) - this.catalogueRank(b.id) || a.id.localeCompare(b.id));
  }

  private static catalogueRank(id: string): number {
    const index = CURATED_ROADMAP_ORDER.indexOf(id);
    return index === -1 ? CURATED_ROADMAP_ORDER.length : index;
  }

  /**
   * Translations share an id and differ by `language` (format v1 contract),
   * so (id, language) is the real key. With `language`, the match is exact —
   * no fallback: the caller only asks for pairs the catalogue advertised.
   * Without it, the pick is deterministic (sorted by language) — used by
   * /validate, where steps and validators are language-neutral.
   */
  public static getRoadmap(
    id: string,
    opts: { language?: string } & RoadmapDirs = {}
  ): Roadmap | null {
    const candidates = this.readAll(opts)
      .map(({ roadmap }) => roadmap)
      .filter(roadmap => roadmap.id === id);
    if (opts.language) {
      return candidates.find(roadmap => roadmap.language === opts.language) ?? null;
    }
    return candidates.sort((a, b) => a.language.localeCompare(b.language))[0] ?? null;
  }

  /**
   * (id, language) pairs of the shipped catalogue — what an import must not
   * collide with (see the shadowing rule in readAll).
   */
  public static builtinKeys(dirs: RoadmapDirs = {}): Set<string> {
    return new Set(
      this.readDir(dirs.dir ?? ROADMAPS_DIR, 'builtin').map(({ roadmap }) =>
        this.key(roadmap.id, roadmap.language)
      )
    );
  }

  /** The catalogue key: translations share an id, so (id, language) is the real key. */
  public static key(id: string, language: string): string {
    return `${id}::${language}`;
  }

  private static readAll(dirs: RoadmapDirs): SourcedRoadmap[] {
    const builtins = this.readDir(dirs.dir ?? ROADMAPS_DIR, 'builtin');
    const imported = this.readDir(dirs.userDir ?? USER_ROADMAPS_DIR, 'imported');

    // A shipped roadmap always wins over a user file with the same
    // (id, language): progress is keyed on the id, and letting a local file
    // shadow the catalogue would silently rewrite what that progress means.
    const shipped = new Set(builtins.map(({ roadmap }) => this.key(roadmap.id, roadmap.language)));
    const merged = [...builtins];
    for (const entry of imported) {
      const key = this.key(entry.roadmap.id, entry.roadmap.language);
      if (shipped.has(key)) {
        console.warn(
          `[learning] Ignoring imported roadmap "${entry.roadmap.id}" (${entry.roadmap.language}): ` +
            'it collides with a shipped roadmap'
        );
        continue;
      }
      merged.push(entry);
    }
    return merged;
  }

  private static readDir(dir: string, source: RoadmapSource): SourcedRoadmap[] {
    if (!fs.existsSync(dir)) {
      // The import directory not existing is the normal state until the first
      // import — only a missing shipped directory is worth a warning.
      if (source === 'builtin') {
        console.warn(`[learning] Roadmaps directory not found: ${dir}`);
      }
      return [];
    }

    const roadmaps: SourcedRoadmap[] = [];
    // Sorted: readdir order is filesystem-dependent, and both the catalogue
    // order and the language-less getRoadmap pick must be stable.
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.json')) {
        continue;
      }
      try {
        const data: unknown = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        const result = validateRoadmap(data);
        if (!result.valid) {
          console.warn(`[learning] Skipping invalid roadmap file ${file}: ${result.errors.join('; ')}`);
          continue;
        }
        roadmaps.push({ roadmap: result.roadmap, source });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[learning] Skipping invalid roadmap file ${file}: ${reason}`);
      }
    }
    return roadmaps;
  }
}
