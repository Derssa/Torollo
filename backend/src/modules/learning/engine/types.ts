import { ContainerInfo } from '../../../infrastructure/docker/providers/containerProvider';
import { DockerErrorCode } from '../../../infrastructure/docker/dockerErrors';
import { NetworkConfigInput, SemanticRule } from '../../network/models/networkPolicy';
import { InterSubnetStatus } from '../../network/services/interSubnetHealth';

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

/**
 * Local view of a project's network config — the connectivity fields the
 * network module already types, plus the one only validators read. The
 * canonical shape lives in the frontend package (`shared/types/network.ts`);
 * the backend never imports it (package boundary).
 * `ProjectService.getNetworkConfig` remains untyped at its own boundary —
 * this interface is where the engine starts trusting it.
 */
export interface ValidatorNetworkConfig extends NetworkConfigInput {
  loadBalancerTargets?: Record<string, string[]>;
}

/** Per-run context shared by every validator of a step. */
export interface ValidatorContext {
  projectId: string;
  /** Lazy and memoized: one Docker call per step run, shared by all validators. */
  getContainers(): Promise<ContainerInfo[]>;
  /** Lazy and memoized: one project read per step run, shared by all validators. */
  getNetworkConfig(): Promise<ValidatorNetworkConfig | null>;
  /** Lazy and memoized: the security-group rules expanded to real container ids. */
  getSemanticRules(): Promise<SemanticRule[]>;
  /**
   * Verdict of the host's real inter-subnet connectivity self-test (see
   * `interSubnetHealth`). Lets connectivity validators refuse to report a
   * pass for cross-subnet rules the host cannot actually honor.
   */
  getInterSubnetStatus(): InterSubnetStatus;
  executePsqlCommand(
    containerId: string,
    database: string,
    sqlQuery: string,
    extraArgs?: string[]
  ): Promise<string>;
  executeRedisCommand(containerId: string, args: string[]): Promise<string>;
  executeMongoCommand(containerId: string, evalExpression: string): Promise<string>;
  executeCustomCommand(containerId: string, cmd: string[]): Promise<string>;
}

export type ValidatorHandler = (
  params: Record<string, unknown>,
  ctx: ValidatorContext
) => Promise<ValidatorOutcome>;

/** Everything the engine needs from the outside world (defaults are the real singletons). */
export interface EngineDeps {
  listContainersByProject(projectId: string): Promise<ContainerInfo[]>;
  getNetworkConfig(projectId: string): Promise<ValidatorNetworkConfig | null>;
  getInterSubnetStatus(projectId: string): InterSubnetStatus;
  executePsqlCommand(
    containerId: string,
    database: string,
    sqlQuery: string,
    extraArgs?: string[]
  ): Promise<string>;
  executeRedisCommand(containerId: string, args: string[]): Promise<string>;
  executeMongoCommand(containerId: string, evalExpression: string): Promise<string>;
  executeCustomCommand(containerId: string, cmd: string[]): Promise<string>;
}
