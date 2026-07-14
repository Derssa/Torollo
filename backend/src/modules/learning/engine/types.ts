import { ContainerInfo } from '../../../infrastructure/docker/providers/containerProvider';
import { DockerErrorCode } from '../../../infrastructure/docker/dockerErrors';

export type ValidatorStatus = 'pass' | 'fail' | 'error';

export type ValidatorErrorCode = DockerErrorCode | 'UNKNOWN_VALIDATOR' | 'INVALID_PARAMS';

/**
 * Result of running one validator of a step, as returned by the API.
 *
 * `pass`/`fail` are pedagogical verdicts for the learner; `error` means the
 * check itself could not run (Docker down, unknown type, bad roadmap params)
 * and is never the learner's fault.
 */
export interface ValidatorResult {
  /** Position in `step.validators` — stable key for the frontend. */
  index: number;
  type: string;
  status: ValidatorStatus;
  message: string;
  /** Present iff `status === 'error'`. */
  errorCode?: ValidatorErrorCode;
  /** Short human-readable snapshots, filled when the check can express them. */
  expected?: string;
  observed?: string;
}

/**
 * Thrown by a handler when the roadmap file's params are unusable for its
 * type — an authoring bug in the roadmap, not a learner failure.
 */
export class InvalidParamsError extends Error {}

/**
 * What a handler returns. Infrastructure problems are not returned: handlers
 * just throw and the engine classifies the error.
 */
export interface ValidatorOutcome {
  status: 'pass' | 'fail';
  message: string;
  expected?: string;
  observed?: string;
}

/** Per-run context shared by every validator of a step. */
export interface ValidatorContext {
  projectId: string;
  /** Lazy and memoized: one Docker call per step run, shared by all validators. */
  getContainers(): Promise<ContainerInfo[]>;
}

export type ValidatorHandler = (
  params: Record<string, unknown>,
  ctx: ValidatorContext
) => Promise<ValidatorOutcome>;

/** Everything the engine needs from the outside world (defaults are the real singletons). */
export interface EngineDeps {
  listContainersByProject(projectId: string): Promise<ContainerInfo[]>;
}
