import fs from 'fs';
import path from 'path';
import os from 'os';

/** Persisted progress of one roadmap step, keyed by the step's stable id. */
export interface StepProgress {
  /** Verdict of the latest validation — same latest-wins semantics as the player. */
  passed: boolean;
  /** Number of validation runs that reached evaluation (rejected requests don't count). */
  attempts: number;
  /** Revealed rungs on the step's hint ladder [...hints, solution?] — an absolute count. */
  revealedHints: number;
  /** ISO timestamp of the latest validation, absent until the first one. */
  lastCheckedAt?: string;
}

/** One (project, roadmap) play-through inside the store. */
export interface ProgressEntry {
  projectId: string;
  roadmapId: string;
  updatedAt: string;
  steps: Record<string, StepProgress>;
}

/**
 * On-disk shape of ~/.torollo/progress.json. `version` is the migration
 * contract: a reader that finds another version must treat the file as
 * unknown (see readStore), never guess.
 */
interface ProgressStore {
  version: typeof STORE_VERSION;
  entries: ProgressEntry[];
}

/** One item of GET /api/learning/progress — documented in docs/learning-api.md. */
export interface ProgressEntrySummary {
  projectId: string;
  roadmapId: string;
  updatedAt: string;
  /** Count of steps whose latest validation passed. */
  completedSteps: number;
}

/** Contract of GET /api/learning/progress/:projectId/:roadmapId — documented in docs/learning-api.md. */
export interface RoadmapProgressResponse {
  projectId: string;
  roadmapId: string;
  steps: Record<string, StepProgress>;
  /** Present (true) once after an unreadable store was moved aside — the UI should tell the user. */
  storeRecovered?: boolean;
}

const STORE_VERSION = 1;
const PROGRESS_PATH = path.join(os.homedir(), '.torollo', 'progress.json');

function isProgressStore(data: unknown): data is ProgressStore {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as ProgressStore).version === STORE_VERSION &&
    Array.isArray((data as ProgressStore).entries)
  );
}

/**
 * Local, account-less persistence of roadmap progression. One JSON file next
 * to projects.json; entries are keyed by (projectId, roadmapId) and step data
 * by the roadmap's stable step ids — never positions, so re-editing a roadmap
 * file cannot corrupt existing progress. Translations share ids, so progress
 * is language-neutral.
 *
 * The validation engine stays stateless: recording happens at the API layer.
 * The optional `filePath` parameter exists for tests only.
 */
export class ProgressService {
  // Set when an unreadable store was moved aside; reported to the frontend by
  // the next getProgress (once), so the user learns their progress was lost.
  private static storeRecovered = false;

  public static getProgress(
    projectId: string,
    roadmapId: string,
    filePath: string = PROGRESS_PATH
  ): RoadmapProgressResponse {
    const store = this.readStore(filePath);
    const entry = store.entries.find(e => e.projectId === projectId && e.roadmapId === roadmapId);
    const response: RoadmapProgressResponse = { projectId, roadmapId, steps: entry?.steps ?? {} };
    if (this.storeRecovered) {
      response.storeRecovered = true;
      this.storeRecovered = false;
    }
    return response;
  }

  /**
   * Summarizes every play-through in the store, for surfaces that show
   * progress across projects (e.g. the landing page's roadmap cards).
   * Deliberately leaves the one-shot `storeRecovered` flag untouched — that
   * notice belongs to the player's getProgress, which can act on it.
   */
  public static listProgress(filePath: string = PROGRESS_PATH): ProgressEntrySummary[] {
    return this.readStore(filePath).entries.map(entry => ({
      projectId: entry.projectId,
      roadmapId: entry.roadmapId,
      updatedAt: entry.updatedAt,
      completedSteps: Object.values(entry.steps).filter(step => step.passed).length,
    }));
  }

  public static recordValidation(
    projectId: string,
    roadmapId: string,
    stepId: string,
    stepPassed: boolean,
    checkedAt: string,
    filePath: string = PROGRESS_PATH
  ): void {
    const store = this.readStore(filePath);
    const step = this.upsertStep(store, projectId, roadmapId, stepId);
    step.attempts += 1;
    step.passed = stepPassed;
    step.lastCheckedAt = checkedAt;
    this.writeStore(store, filePath);
  }

  public static recordRevealedHints(
    projectId: string,
    roadmapId: string,
    stepId: string,
    revealedHints: number,
    filePath: string = PROGRESS_PATH
  ): void {
    const store = this.readStore(filePath);
    const step = this.upsertStep(store, projectId, roadmapId, stepId);
    // Absolute count, not an increment: a lost update self-heals on the next reveal.
    step.revealedHints = revealedHints;
    this.writeStore(store, filePath);
  }

  /** Forgets one (project, roadmap) play-through — the "restart roadmap" action. */
  public static resetProgress(
    projectId: string,
    roadmapId: string,
    filePath: string = PROGRESS_PATH
  ): void {
    const store = this.readStore(filePath);
    store.entries = store.entries.filter(
      e => !(e.projectId === projectId && e.roadmapId === roadmapId)
    );
    this.writeStore(store, filePath);
  }

  /** Called from project deletion: progress is meaningless without its project's containers. */
  public static deleteProjectProgress(projectId: string, filePath: string = PROGRESS_PATH): void {
    const store = this.readStore(filePath);
    store.entries = store.entries.filter(e => e.projectId !== projectId);
    this.writeStore(store, filePath);
  }

  private static upsertStep(
    store: ProgressStore,
    projectId: string,
    roadmapId: string,
    stepId: string
  ): StepProgress {
    let entry = store.entries.find(e => e.projectId === projectId && e.roadmapId === roadmapId);
    if (!entry) {
      entry = { projectId, roadmapId, updatedAt: '', steps: {} };
      store.entries.push(entry);
    }
    entry.updatedAt = new Date().toISOString();
    let step = entry.steps[stepId];
    if (!step) {
      step = { passed: false, attempts: 0, revealedHints: 0 };
      entry.steps[stepId] = step;
    }
    return step;
  }

  private static readStore(filePath: string): ProgressStore {
    if (!fs.existsSync(filePath)) {
      return { version: STORE_VERSION, entries: [] };
    }
    try {
      const data: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (isProgressStore(data)) {
        return data;
      }
    } catch {
      // Unparseable — recovered below, same as an unknown shape/version.
    }
    // Never crash and never guess: move the unreadable file aside so nothing
    // is silently destroyed, start fresh, and flag it for the next getProgress.
    try {
      fs.renameSync(filePath, `${filePath}.corrupt`);
    } catch (err: unknown) {
      console.error(`[learning] Failed to move unreadable progress store aside:`, err);
    }
    console.error(
      `[learning] Progress store ${filePath} was unreadable or of an unknown version; ` +
        `starting fresh (previous file kept as progress.json.corrupt).`
    );
    this.storeRecovered = true;
    return { version: STORE_VERSION, entries: [] };
  }

  private static writeStore(store: ProgressStore, filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Write-then-rename: a crash mid-write can never leave a truncated store.
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2));
    fs.renameSync(tmpPath, filePath);
  }
}
