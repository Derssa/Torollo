import { httpGetContains } from './httpGetContains';
import { InvalidParamsError } from '../types';
import { makeContainer, makeContext } from './testSupport';

const web = makeContainer({ id: 'web-1', name: 'web' });

describe('httpGetContains', () => {
  it('passes when the server responds with expected text', async () => {
    const mockExec = jest.fn().mockResolvedValue('<html><body>Users List</body></html>');
    const outcome = await httpGetContains(
      { node: 'web', port: 80, path: '/', expectedText: 'Users List' },
      makeContext({
        containers: [web],
        executeCustomCommand: mockExec,
      })
    );

    expect(outcome.status).toBe('pass');
    expect(mockExec).toHaveBeenCalledWith('web-1', ['curl', '-s', 'http://localhost:80/']);
  });

  it('fails when no container has the given name', async () => {
    const outcome = await httpGetContains(
      { node: 'web', port: 80, path: '/', expectedText: 'Users List' },
      makeContext({ containers: [] })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('No container named "web" exists');
  });

  it('fails when container is not running', async () => {
    const outcome = await httpGetContains(
      { node: 'web', port: 80, path: '/', expectedText: 'Users List' },
      makeContext({
        containers: [makeContainer({ name: 'web', state: 'exited' })],
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('is not running');
  });

  it('fails when server is down / connection refused', async () => {
    const mockExec = jest.fn().mockResolvedValue('curl: (7) Failed to connect to localhost port 80');
    const outcome = await httpGetContains(
      { node: 'web', port: 80, path: '/', expectedText: 'Users List' },
      makeContext({
        containers: [web],
        executeCustomCommand: mockExec,
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('Could not connect to the web server');
    expect(outcome.observed).toContain('Failed to connect');
  });

  it('fails when response does not contain the expected text', async () => {
    const mockExec = jest.fn().mockResolvedValue('Hello World');
    const outcome = await httpGetContains(
      { node: 'web', port: 80, path: '/', expectedText: 'Users List' },
      makeContext({
        containers: [web],
        executeCustomCommand: mockExec,
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('did not return the expected content');
    expect(outcome.observed).toBe('Hello World');
  });

  it('throws InvalidParamsError when params are missing', async () => {
    await expect(
      httpGetContains({ node: 'web', port: 80 }, makeContext())
    ).rejects.toThrow(InvalidParamsError);
  });
});
