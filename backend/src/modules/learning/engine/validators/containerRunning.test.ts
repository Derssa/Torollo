import { containerRunning } from './containerRunning';
import { InvalidParamsError } from '../types';
import { makeContainer, makeContext } from './testSupport';

describe('containerRunning', () => {
  it('passes when the named container is running', async () => {
    const outcome = await containerRunning(
      { node: 'web' },
      makeContext({ containers: [makeContainer({ name: 'web' })] })
    );

    expect(outcome.status).toBe('pass');
    expect(outcome.message).toContain('"web"');
  });

  it('fails when no container has the given name', async () => {
    const outcome = await containerRunning(
      { node: 'web' },
      makeContext({ containers: [makeContainer({ name: 'db' })] })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('No container named "web"');
    expect(outcome.expected).toBe('a running container named "web"');
    expect(outcome.observed).toBe('no container with that name');
  });

  it('fails when the container exists but is not running', async () => {
    const outcome = await containerRunning(
      { node: 'web' },
      makeContext({ containers: [makeContainer({ name: 'web', state: 'exited' })] })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('not running (current state: exited)');
    expect(outcome.expected).toBe('running');
    expect(outcome.observed).toBe('exited');
  });

  it('throws InvalidParamsError when the "node" param is missing', async () => {
    await expect(containerRunning({}, makeContext())).rejects.toThrow(InvalidParamsError);
  });

  it('throws InvalidParamsError when the "node" param is not a string', async () => {
    await expect(containerRunning({ node: 42 }, makeContext())).rejects.toThrow(
      InvalidParamsError
    );
  });
});
