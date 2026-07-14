import { RoadmapStep } from '../format/roadmapTypes';
import { classifyDockerError } from '../../../infrastructure/docker/dockerErrors';
import { containerProvider } from '../../../infrastructure/docker/providers/dockerContainerProvider';
import { ContainerInfo } from '../../../infrastructure/docker/providers/containerProvider';
import { validatorRegistry } from './registry';
import {
  EngineDeps,
  InvalidParamsError,
  ValidatorContext,
  ValidatorHandler,
  ValidatorResult,
} from './types';

export const defaultEngineDeps: EngineDeps = {
  listContainersByProject: (projectId) => containerProvider.listContainersByProject(projectId),
};

/**
 * Runs every validator of a step against the real state of the project.
 *
 * Validators run sequentially, in roadmap order, and each failure is isolated:
 * an unknown type, bad params or an infrastructure error (Docker down, ...)
 * produce an `error` result for that validator and the others still run.
 * The engine is stateless — it evaluates, it never records.
 */
export async function runStepValidators(
  projectId: string,
  step: RoadmapStep,
  deps: EngineDeps = defaultEngineDeps,
  registry: Readonly<Record<string, ValidatorHandler>> = validatorRegistry
): Promise<ValidatorResult[]> {
  // Memoized on the promise: one Docker call per step run, shared by all
  // validators — including a rejection, so every Docker-backed validator of
  // the step reports the same infrastructure error from a single attempt.
  let containersPromise: Promise<ContainerInfo[]> | undefined;
  const ctx: ValidatorContext = {
    projectId,
    getContainers: () => {
      containersPromise ??= deps.listContainersByProject(projectId);
      return containersPromise;
    },
  };

  const results: ValidatorResult[] = [];
  for (const [index, validator] of step.validators.entries()) {
    const handler = registry[validator.type];
    if (!handler) {
      results.push({
        index,
        type: validator.type,
        status: 'error',
        errorCode: 'UNKNOWN_VALIDATOR',
        message: `Unknown validator type "${validator.type}" — this roadmap may require a newer version of Torollo.`,
      });
      continue;
    }

    try {
      const outcome = await handler(validator.params, ctx);
      results.push({ index, type: validator.type, ...outcome });
    } catch (err: unknown) {
      if (err instanceof InvalidParamsError) {
        results.push({
          index,
          type: validator.type,
          status: 'error',
          errorCode: 'INVALID_PARAMS',
          message: `This roadmap step is misconfigured: ${err.message}.`,
        });
        continue;
      }
      const classified = classifyDockerError(err, `running the "${validator.type}" check`);
      console.error(`[learning] Validator "${validator.type}" failed to run:`, err);
      results.push({
        index,
        type: validator.type,
        status: 'error',
        errorCode: classified.code,
        message: classified.userMessage,
      });
    }
  }
  return results;
}
