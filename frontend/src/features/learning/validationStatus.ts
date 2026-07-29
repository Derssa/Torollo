import type { StepValidationResponse } from '../../shared/types/roadmap';

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

// Matches the backend DockerErrorCode emitted when the daemon is unreachable
// (backend infrastructure/docker/dockerErrors.ts).
const DOCKER_UNAVAILABLE = 'DOCKER_UNAVAILABLE';

/** True when a check of this attempt could not run because the Docker daemon was unreachable. */
export function isDockerUnavailable(response: StepValidationResponse): boolean {
  return response.results.some(result => result.errorCode === DOCKER_UNAVAILABLE);
}
