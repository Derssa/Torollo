import Ajv2020, { ErrorObject } from 'ajv/dist/2020';
import roadmapSchema from './roadmap.schema.json';
import { Roadmap, ROADMAP_SCHEMA_VERSION } from './roadmapTypes';

export type RoadmapValidationResult =
  | { valid: true; roadmap: Roadmap }
  | { valid: false; errors: string[] };

const ajv = new Ajv2020({ allErrors: true });
const validateAgainstSchema = ajv.compile(roadmapSchema);

/** Formats an Ajv error so it always points at the faulty field. */
function formatError(error: ErrorObject): string {
  const path = error.instancePath || '(root)';
  if (error.keyword === 'required') {
    return `${path || '(root)'}: missing required field "${error.params.missingProperty}"`;
  }
  if (error.keyword === 'additionalProperties') {
    return `${path}: unknown field "${error.params.additionalProperty}" — check for typos`;
  }
  return `${path}: ${error.message}`;
}

/**
 * Validates arbitrary parsed JSON against the roadmap format (schemaVersion 1).
 *
 * Pure function, no I/O: callers read the file (CLI, roadmap loader) and pass
 * the parsed value. On failure, every error message points at the faulty field.
 */
export function validateRoadmap(data: unknown): RoadmapValidationResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['(root): a roadmap must be a JSON object'] };
  }

  const { schemaVersion } = data as Record<string, unknown>;
  if (schemaVersion !== undefined && schemaVersion !== ROADMAP_SCHEMA_VERSION) {
    return {
      valid: false,
      errors: [
        `/schemaVersion: unsupported schemaVersion ${JSON.stringify(schemaVersion)} — ` +
          `this version of Torollo reads schemaVersion ${ROADMAP_SCHEMA_VERSION}`,
      ],
    };
  }

  if (!validateAgainstSchema(data)) {
    return { valid: false, errors: (validateAgainstSchema.errors ?? []).map(formatError) };
  }

  const roadmap = data as unknown as Roadmap;

  // Uniqueness of step ids is not expressible in JSON Schema.
  const errors: string[] = [];
  const seenStepIds = new Map<string, number>();
  roadmap.steps.forEach((step, index) => {
    const firstIndex = seenStepIds.get(step.id);
    if (firstIndex !== undefined) {
      errors.push(
        `/steps/${index}/id: duplicate step id "${step.id}" (already used at /steps/${firstIndex}/id)`
      );
    } else {
      seenStepIds.set(step.id, index);
    }
  });
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, roadmap };
}
