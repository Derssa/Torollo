import type { StepValidationResponse, ValidatorStatus } from '../../shared/types/roadmap';

export type StepOutcome = 'passed' | 'failed' | 'error';

/**
 * Aggregates a step's validator results into a single outcome.
 * `error` wins over `failed`: when a check could not run, the step's real
 * state is unknowable — telling the learner "not yet, fix your work" would
 * blame them for an infrastructure problem. Failed checks still render
 * individually below the banner, so no pedagogical information is lost.
 */
export function stepOutcome(response: StepValidationResponse): StepOutcome {
  if (response.stepPassed) return 'passed';
  if (response.results.some(result => result.status === 'error')) return 'error';
  return 'failed';
}

export const STATUS_COLORS: Record<ValidatorStatus, string> = {
  pass: 'var(--color-success)',
  fail: 'var(--color-danger)',
  error: 'var(--color-warning)',
};
