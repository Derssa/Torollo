/**
 * TypeScript types for the Torollo roadmap format, version 1.
 *
 * KEEP IN SYNC with the backend sources —
 * format types:  backend/src/modules/learning/format/roadmapTypes.ts
 * API types:     backend/src/modules/learning/engine/types.ts (ValidatorResult),
 *                controllers/learningController.ts (StepValidationResponse),
 *                services/roadmapService.ts (RoadmapSummary).
 * The duplication is deliberate: backend and frontend are separate npm
 * packages (same policy as the Project type in shared/types/index.ts).
 * Source of truth for the format is the JSON Schema:
 * backend/src/modules/learning/format/roadmap.schema.json
 * API contract: docs/learning-api.md
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

/** One catalogue entry of GET /api/learning/roadmaps — one per file, so translations are separate entries. */
export interface RoadmapSummary {
  id: string;
  title: string;
  description: string;
  language: string;
  difficulty?: RoadmapDifficulty;
  estimatedMinutes?: number;
  stepCount: number;
}

export type ValidatorStatus = 'pass' | 'fail' | 'error';

/**
 * Result of one validator, as returned by POST /api/learning/validate.
 * `fail` is a pedagogical failure (normal state — the learner isn't done);
 * `error` means the check itself could not run (never the learner's fault).
 */
export interface ValidatorResult {
  /** Position in step.validators — the stable key of the result. */
  index: number;
  type: string;
  status: ValidatorStatus;
  message: string;
  /**
   * Set iff status is 'error'. Wider than the backend union: the frontend matches
   * the codes it knows (see features/learning/validationStatus.ts) and treats the
   * rest generically, so new backend codes never break rendering.
   */
  errorCode?: string;
  expected?: string;
  observed?: string;
}

/** Response of POST /api/learning/validate. */
export interface StepValidationResponse {
  roadmapId: string;
  stepId: string;
  /** true iff every result is 'pass' — an 'error' never validates a step. */
  stepPassed: boolean;
  results: ValidatorResult[];
  /** ISO timestamp of the evaluation. */
  checkedAt: string;
}
