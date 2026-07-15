import { redisKeyExists } from './redisKeyExists';
import { InvalidParamsError } from '../types';
import { makeContainer, makeContext } from './testSupport';

const redisContainer = makeContainer({ id: 'redis-1', name: 'cache', type: 'redis' });

describe('redisKeyExists', () => {
  it('passes when a matching key exists', async () => {
    const outcome = await redisKeyExists(
      { node: 'cache', key: 'session:*' },
      makeContext({
        containers: [redisContainer],
        executeRedisCommand: () => Promise.resolve('session:abc\n'),
      })
    );

    expect(outcome.status).toBe('pass');
  });

  it('fails when no key matches', async () => {
    const outcome = await redisKeyExists(
      { node: 'cache', key: 'session:*' },
      makeContext({ containers: [redisContainer], executeRedisCommand: () => Promise.resolve('') })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('no matching key');
  });

  it('fails pedagogically when Redis is still starting up', async () => {
    const outcome = await redisKeyExists(
      { node: 'cache', key: 'session:*' },
      makeContext({
        containers: [redisContainer],
        executeRedisCommand: () => Promise.resolve('ERROR: Redis server is still starting up.'),
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('database not ready yet');
  });

  it('fails when the node is not a Redis node', async () => {
    const outcome = await redisKeyExists(
      { node: 'cache', key: 'session:*' },
      makeContext({ containers: [makeContainer({ name: 'cache', type: 'postgres' })] })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('not a Redis node');
  });

  it('throws InvalidParamsError when "key" is missing', async () => {
    await expect(redisKeyExists({ node: 'cache' }, makeContext())).rejects.toThrow(
      InvalidParamsError
    );
  });
});
