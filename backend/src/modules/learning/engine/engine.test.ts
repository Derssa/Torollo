import { runStepValidators } from './engine';
import { EngineDeps, InvalidParamsError, ValidatorHandler } from './types';
import { RoadmapStep } from '../format/roadmapTypes';
import { ContainerInfo } from '../../../infrastructure/docker/providers/containerProvider';

const runningWeb: ContainerInfo = {
  id: 'abc123',
  name: 'web',
  image: 'ubuntu:22.04',
  state: 'running',
  status: 'Up 2 minutes',
};

function makeStep(validators: RoadmapStep['validators']): RoadmapStep {
  return { id: 'step-1', title: 'Step 1', instruction: 'Do the thing.', validators };
}

function makeDeps(impl?: EngineDeps['listContainersByProject']): EngineDeps & {
  listContainersByProject: jest.Mock;
} {
  return {
    listContainersByProject: jest.fn(impl ?? (() => Promise.resolve([runningWeb]))),
    getNetworkConfig: () => Promise.resolve(null),
    executePsqlCommand: () => Promise.resolve(''),
    executeRedisCommand: () => Promise.resolve(''),
    executeMongoCommand: () => Promise.resolve(''),
  };
}

describe('runStepValidators', () => {
  it('dispatches each validator by type with its params and keeps roadmap order', async () => {
    const first = jest.fn<ReturnType<ValidatorHandler>, Parameters<ValidatorHandler>>(
      async () => ({ status: 'pass', message: 'first ok' })
    );
    const second = jest.fn<ReturnType<ValidatorHandler>, Parameters<ValidatorHandler>>(
      async () => ({ status: 'fail', message: 'second ko', expected: 'a', observed: 'b' })
    );
    const step = makeStep([
      { type: 'first_check', params: { node: 'web' } },
      { type: 'second_check', params: { node: 'db' } },
    ]);

    const results = await runStepValidators('project-1', step, makeDeps(), {
      first_check: first,
      second_check: second,
    });

    expect(first).toHaveBeenCalledWith({ node: 'web' }, expect.anything());
    expect(second).toHaveBeenCalledWith({ node: 'db' }, expect.anything());
    expect(results).toEqual([
      { index: 0, type: 'first_check', status: 'pass', message: 'first ok' },
      {
        index: 1,
        type: 'second_check',
        status: 'fail',
        message: 'second ko',
        expected: 'a',
        observed: 'b',
      },
    ]);
  });

  it('reports an unknown validator type as an error and still runs the others', async () => {
    const known = jest.fn(async () => ({ status: 'pass' as const, message: 'ok' }));
    const step = makeStep([
      { type: 'does_not_exist', params: {} },
      { type: 'known_check', params: {} },
    ]);

    const results = await runStepValidators('project-1', step, makeDeps(), {
      known_check: known,
    });

    expect(results[0]).toMatchObject({
      status: 'error',
      errorCode: 'UNKNOWN_VALIDATOR',
      message: expect.stringContaining('does_not_exist'),
    });
    expect(results[1]).toMatchObject({ status: 'pass', message: 'ok' });
  });

  it('classifies a Docker daemon failure as an infrastructure error without stopping the others', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const broken: ValidatorHandler = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED /var/run/docker.sock'), {
        code: 'ECONNREFUSED',
      });
    };
    const healthy: ValidatorHandler = async () => ({ status: 'pass', message: 'ok' });
    const step = makeStep([
      { type: 'broken_check', params: {} },
      { type: 'healthy_check', params: {} },
    ]);

    const results = await runStepValidators('project-1', step, makeDeps(), {
      broken_check: broken,
      healthy_check: healthy,
    });

    expect(results[0]).toMatchObject({ status: 'error', errorCode: 'DOCKER_UNAVAILABLE' });
    expect(results[0].message).toContain('Docker');
    expect(results[1]).toMatchObject({ status: 'pass' });
  });

  it('reports InvalidParamsError as a roadmap authoring error', async () => {
    const picky: ValidatorHandler = async () => {
      throw new InvalidParamsError('validator param "node" must be a non-empty string');
    };
    const step = makeStep([{ type: 'picky_check', params: {} }]);

    const results = await runStepValidators('project-1', step, makeDeps(), {
      picky_check: picky,
    });

    expect(results[0]).toMatchObject({
      status: 'error',
      errorCode: 'INVALID_PARAMS',
      message: expect.stringContaining('"node" must be a non-empty string'),
    });
  });

  it('fetches the container list once for all validators of the step', async () => {
    const usesContainers: ValidatorHandler = async (_params, ctx) => {
      await ctx.getContainers();
      return { status: 'pass', message: 'ok' };
    };
    const deps = makeDeps();
    const step = makeStep([
      { type: 'check_a', params: {} },
      { type: 'check_b', params: {} },
    ]);

    await runStepValidators('project-1', step, deps, {
      check_a: usesContainers,
      check_b: usesContainers,
    });

    expect(deps.listContainersByProject).toHaveBeenCalledTimes(1);
    expect(deps.listContainersByProject).toHaveBeenCalledWith('project-1');
  });

  it('shares a failed container fetch: every Docker-backed validator reports the same error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const usesContainers: ValidatorHandler = async (_params, ctx) => {
      await ctx.getContainers();
      return { status: 'pass', message: 'ok' };
    };
    const deps = makeDeps(() =>
      Promise.reject(
        Object.assign(new Error('connect ECONNREFUSED /var/run/docker.sock'), {
          code: 'ECONNREFUSED',
        })
      )
    );
    const step = makeStep([
      { type: 'check_a', params: {} },
      { type: 'check_b', params: {} },
    ]);

    const results = await runStepValidators('project-1', step, deps, {
      check_a: usesContainers,
      check_b: usesContainers,
    });

    expect(deps.listContainersByProject).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({ status: 'error', errorCode: 'DOCKER_UNAVAILABLE' });
    expect(results[1]).toMatchObject({ status: 'error', errorCode: 'DOCKER_UNAVAILABLE' });
  });
});
