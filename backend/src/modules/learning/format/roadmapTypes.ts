/**
 * TypeScript types for the Torollo roadmap format, version 1.
 *
 * Source of truth for the format itself is the JSON Schema next to this file
 * (roadmap.schema.json); these types mirror it for consumers in this package.
 * The frontend keeps a documented copy in frontend/src/shared/types/roadmap.ts.
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
