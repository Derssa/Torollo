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
