import fs from 'fs';
import path from 'path';
import os from 'os';
import { containerProvider } from '../../../infrastructure/docker/providers/dockerContainerProvider';
import { NetworkService } from '../../network/services/networkService';
import { ProgressService } from '../../learning/services/progressService';
import { Project, ProjectStore, STORE_VERSION, parseProjectsRaw } from './projectStore';

export type { Project } from './projectStore';

const TOROLLO_DIR = path.join(os.homedir(), '.torollo');
const DB_PATH = path.join(TOROLLO_DIR, 'projects.json');

/**
 * Persistence of projects in ~/.torollo/projects.json. Same durability
 * standard as the learning progress store — atomic write-then-rename,
 * versioned envelope, non-destructive recovery of an unreadable file — plus
 * one addition: every read-modify-write runs through a serialization queue,
 * so concurrent operations can never lose each other's updates.
 *
 * The legacy format (a bare JSON array) is read transparently and upgraded
 * to the envelope on the next write; no manual migration.
 *
 * The optional `filePath` parameters exist for tests only.
 */
export class ProjectService {
  // Set when an unreadable store was moved aside; reported to the frontend by
  // the next projects listing (once), so the user learns what happened.
  private static storeRecovered = false;

  // FIFO serialization of store transactions. A failed task must not poison
  // the chain, hence the swallow when re-chaining.
  private static queue: Promise<unknown> = Promise.resolve();

  private static enqueue<T>(task: () => T | Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  /**
   * Runs one serialized read-modify-write transaction. `fn` may mutate the
   * store draft (including reassigning `store.projects`); the result is
   * persisted atomically when it returns. The queue holds the store for the
   * whole transaction — never do Docker or network I/O inside `fn`.
   */
  private static mutate<T>(
    fn: (store: ProjectStore) => T | Promise<T>,
    filePath: string
  ): Promise<T> {
    return this.enqueue(async () => {
      const store = this.readStore(filePath);
      const result = await fn(store);
      this.writeStore(store, filePath);
      return result;
    });
  }

  /** Serialized read-only access — waits for pending writes, writes nothing. */
  private static withStore<T>(fn: (store: ProjectStore) => T, filePath: string): Promise<T> {
    return this.enqueue(() => fn(this.readStore(filePath)));
  }

  /** One-shot: reports whether an unreadable store was moved aside, then clears. */
  public static consumeStoreRecovered(): boolean {
    const recovered = this.storeRecovered;
    this.storeRecovered = false;
    return recovered;
  }

  public static async listProjects(filePath: string = DB_PATH): Promise<Project[]> {
    return this.withStore(store => store.projects, filePath);
  }

  public static async createProject(name: string, filePath: string = DB_PATH): Promise<Project> {
    return this.mutate(store => {
      const newProject: Project = {
        id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name,
        createdAt: new Date().toISOString()
      };
      store.projects.push(newProject);
      return newProject;
    }, filePath);
  }

  public static async deleteProject(id: string, filePath: string = DB_PATH): Promise<void> {
    const project = await this.withStore(store => store.projects.find(p => p.id === id), filePath);
    if (project && project.networkConfig) {
      try {
        await NetworkService.cleanupProjectNetwork(id, project.networkConfig);
      } catch (err) {
        console.error(`Failed to cleanup network policies during project cleanup:`, err);
      }
    }

    await this.mutate(store => {
      store.projects = store.projects.filter(p => p.id !== id);
    }, filePath);

    // Learning progress is validated against this project's containers —
    // without them it is meaningless, so it goes with the project.
    try {
      ProgressService.deleteProjectProgress(id);
    } catch (err) {
      console.error(`Failed to delete learning progress during project cleanup:`, err);
    }

    // Stop and delete all containers belonging to this project
    const containers = await containerProvider.listContainersByProject(id);
    for (const c of containers) {
      try {
        await containerProvider.deleteContainer(c.id);
      } catch (err) {
        console.error(`Failed to delete container ${c.id} during project cleanup:`, err);
      }
    }
  }

  public static async getNetworkConfig(projectId: string, filePath: string = DB_PATH): Promise<any> {
    return this.withStore(
      store => store.projects.find(p => p.id === projectId)?.networkConfig || null,
      filePath
    );
  }

  public static async saveNetworkConfig(
    projectId: string,
    networkConfig: any,
    filePath: string = DB_PATH
  ): Promise<void> {
    await this.mutate(store => {
      const project = store.projects.find(p => p.id === projectId);
      if (project) {
        project.networkConfig = networkConfig;
      }
    }, filePath);
  }

  private static readStore(filePath: string): ProjectStore {
    if (!fs.existsSync(filePath)) {
      return { version: STORE_VERSION, projects: [] };
    }
    try {
      // Accepts the legacy bare-array format too: not a corruption — read
      // as-is, the next write persists the envelope.
      const projects = parseProjectsRaw(fs.readFileSync(filePath, 'utf-8'));
      if (projects !== null) {
        return { version: STORE_VERSION, projects };
      }
    } catch {
      // Unreadable file — recovered below, same as unparseable content.
    }
    // Never crash and never guess: move the unreadable file aside so nothing
    // is silently destroyed, start fresh, and flag it for the next listing.
    try {
      fs.renameSync(filePath, `${filePath}.corrupt`);
    } catch (err: unknown) {
      console.error(`[projects] Failed to move unreadable project store aside:`, err);
    }
    console.error(
      `[projects] Project store ${filePath} was unreadable or of an unknown version; ` +
        `starting fresh (previous file kept as projects.json.corrupt).`
    );
    this.storeRecovered = true;
    return { version: STORE_VERSION, projects: [] };
  }

  private static writeStore(store: ProjectStore, filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Write-then-rename: a crash mid-write can never leave a truncated store.
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2));
    fs.renameSync(tmpPath, filePath);
  }
}
