import { ValidatorHandler } from '../types';
import { requireStringParam } from '../params';
import { resolveRunningContainer } from './shared';

/**
 * `redis_key_exists` — checks that a key (or glob pattern, e.g. `session:*`)
 * exists in a node's Redis. Params: `{ node: string, key: string }` (docs/roadmap-format.md).
 */
export const redisKeyExists: ValidatorHandler = async (params, ctx) => {
  const node = requireStringParam(params, 'node');
  const key = requireStringParam(params, 'key');

  const containers = await ctx.getContainers();
  const resolved = resolveRunningContainer(containers, node, ['redis'], 'Redis');
  if ('outcome' in resolved) return resolved.outcome;

  const output = await ctx.executeRedisCommand(resolved.container.id, ['KEYS', key]);

  if (output.startsWith('ERROR')) {
    return {
      status: 'fail',
      message: `Redis on "${node}" is still starting up. Wait a few seconds and try again.`,
      expected: `a key matching "${key}"`,
      observed: 'database not ready yet',
    };
  }

  if (output.trim().length === 0) {
    return {
      status: 'fail',
      message: `No key matching "${key}" exists in Redis on "${node}" yet.`,
      expected: `a key matching "${key}"`,
      observed: 'no matching key',
    };
  }

  return { status: 'pass', message: `A key matching "${key}" exists in Redis on "${node}".` };
};
