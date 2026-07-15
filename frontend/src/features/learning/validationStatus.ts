import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
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

// Matches the backend DockerErrorCode emitted when the daemon is unreachable
// (backend infrastructure/docker/dockerErrors.ts).
const DOCKER_UNAVAILABLE = 'DOCKER_UNAVAILABLE';

/** True when a check of this attempt could not run because the Docker daemon was unreachable. */
export function isDockerUnavailable(response: StepValidationResponse): boolean {
  return response.results.some(result => result.errorCode === DOCKER_UNAVAILABLE);
}

interface StatusPreset {
  icon: typeof CheckCircle2;
  color: string;
  labelKey: string;
}

/** Single source of each status's visual identity (icon, color, i18n label). */
export const STATUS_PRESETS: Record<ValidatorStatus, StatusPreset> = {
  pass: { icon: CheckCircle2, color: 'var(--color-success)', labelKey: 'learning.player.markerPassed' },
  fail: { icon: XCircle, color: 'var(--color-danger)', labelKey: 'learning.player.markerFailed' },
  error: { icon: AlertTriangle, color: 'var(--color-warning)', labelKey: 'learning.player.markerError' },
};

/** Preset for a step's aggregate outcome — the step-list marker shows one glyph per step. */
export function outcomePreset(response: StepValidationResponse): StatusPreset {
  const status: Record<StepOutcome, ValidatorStatus> = { passed: 'pass', failed: 'fail', error: 'error' };
  return STATUS_PRESETS[status[stepOutcome(response)]];
}
