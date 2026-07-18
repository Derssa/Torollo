export interface Project {
  id: string;
  name: string;
  createdAt: string;
  networkConfig?: any;
}

/**
 * On-disk shape of ~/.torollo/projects.json. `version` is the migration
 * contract: a reader that finds another version must treat the file as
 * unknown, never guess. Same convention as the learning progress store.
 */
export interface ProjectStore {
  version: typeof STORE_VERSION;
  projects: Project[];
}

export const STORE_VERSION = 1;

export function isProjectStore(data: unknown): data is ProjectStore {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as ProjectStore).version === STORE_VERSION &&
    Array.isArray((data as ProjectStore).projects)
  );
}

/**
 * Pure parser of a projects file's raw contents — no fs, no side effects, so
 * it is safe for readers (like startup network cleanup) that must never
 * mutate the store. Accepts both the legacy bare-array format and the
 * versioned envelope; anything else (broken JSON, unknown version) is null.
 */
export function parseProjectsRaw(raw: string): Project[] | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data;
    }
    if (isProjectStore(data)) {
      return data.projects;
    }
  } catch {
    // Unparseable — same as an unknown shape/version.
  }
  return null;
}
