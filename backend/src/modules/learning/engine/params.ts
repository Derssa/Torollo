import { InvalidParamsError } from './types';

/**
 * Helpers used by validator handlers to check their raw `params` (inert JSON
 * from the roadmap file). Throwing InvalidParamsError makes the engine report
 * the validator as an authoring error, not a learner failure.
 */
export function requireStringParam(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidParamsError(`validator param "${name}" must be a non-empty string`);
  }
  return value;
}

export function requireNumberParam(params: Record<string, unknown>, name: string): number {
  const value = params[name];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidParamsError(`validator param "${name}" must be a number`);
  }
  return value;
}

export function optionalStringParam(
  params: Record<string, unknown>,
  name: string,
  fallback: string
): string {
  const value = params[name];
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidParamsError(`validator param "${name}" must be a non-empty string when present`);
  }
  return value;
}

export function optionalNumberParam(
  params: Record<string, unknown>,
  name: string
): number | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidParamsError(`validator param "${name}" must be a number when present`);
  }
  return value;
}
