import { containerRunning } from './containerRunning';
import { InvalidParamsError, ValidatorContext } from '../types';
import { ContainerInfo } from '../../../../infrastructure/docker/providers/containerProvider';

function makeContainer(overrides: Partial<ContainerInfo>): ContainerInfo {
  return {
    id: 'abc123',
    name: 'web',
    image: 'ubuntu:22.04',
    state: 'running',
    status: 'Up 2 minutes',
    ...overrides,
  };
}

function makeContext(containers: ContainerInfo[]): ValidatorContext {
  return {
    projectId: 'project-1',
    getContainers: () => Promise.resolve(containers),
  };
}

describe('containerRunning', () => {
  it('passes when the named container is running', async () => {
    const outcome = await containerRunning({ node: 'web' }, makeContext([makeContainer({})]));

    expect(outcome.status).toBe('pass');
    expect(outcome.message).toContain('"web"');
  });

  it('fails when no container has the given name', async () => {
    const outcome = await containerRunning(
      { node: 'web' },
      makeContext([makeContainer({ name: 'db' })])
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('No container named "web"');
    expect(outcome.expected).toBe('a running container named "web"');
    expect(outcome.observed).toBe('no container with that name');
  });

  it('fails when the container exists but is not running', async () => {
    const outcome = await containerRunning(
      { node: 'web' },
      makeContext([makeContainer({ state: 'exited' })])
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('not running (current state: exited)');
    expect(outcome.expected).toBe('running');
    expect(outcome.observed).toBe('exited');
  });

  it('throws InvalidParamsError when the "node" param is missing', async () => {
    await expect(containerRunning({}, makeContext([]))).rejects.toThrow(InvalidParamsError);
  });

  it('throws InvalidParamsError when the "node" param is not a string', async () => {
    await expect(containerRunning({ node: 42 }, makeContext([]))).rejects.toThrow(
      InvalidParamsError
    );
  });
});
