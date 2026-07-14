/**
 * TypeScript types for the Torollo roadmap format, version 1.
 *
 * KEEP IN SYNC with backend/src/modules/learning/format/roadmapTypes.ts —
 * the duplication is deliberate: backend and frontend are separate npm
 * packages (same policy as the Project type in shared/types/index.ts).
 * Source of truth for the format is the JSON Schema:
 * backend/src/modules/learning/format/roadmap.schema.json
 *
 * Format documentation: docs/roadmap-format.md
 */

export const ROADMAP_SCHEMA_VERSION = 1 as const;

/** A purely declarative check: `params` is inert JSON interpreted by the engine. */
export interface RoadmapValidator {
  type: string;
  params: Record<string, unknown>;
}

export interface RoadmapStep {
  /** Stable identifier, unique within the roadmap, independent of position. */
  id: string;
  title: string;
  /** What the learner must do. Markdown allowed. */
  instruction: string;
  /** Ordered progressive hints (hint 1 first). */
  hints?: string[];
  /** Full solution, revealed after all hints. */
  solution?: string;
  validators: RoadmapValidator[];
}

export type RoadmapDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Roadmap {
  schemaVersion: typeof ROADMAP_SCHEMA_VERSION;
  /** Stable identifier — progression is keyed on it. */
  id: string;
  title: string;
  description: string;
  /** Language of all texts in the file (e.g. "en", "fr"). One language per file. */
  language: string;
  estimatedMinutes?: number;
  difficulty?: RoadmapDifficulty;
  prerequisites?: string[];
  steps: RoadmapStep[];
}
