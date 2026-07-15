import { ValidatorHandler } from '../types';
import { requireStringParam, optionalStringParam } from '../params';
import { resolveRunningContainer } from './shared';

/** mongosh's implicit default database when none is selected. */
const DEFAULT_DATABASE = 'test';

const escapeJsStringLiteral = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * `mongo_collection_exists` — checks that a collection exists in a node's
 * MongoDB. Params: `{ node: string, collection: string, database?: string }`
 * (docs/roadmap-format.md); `database` defaults to `"test"`.
 */
export const mongoCollectionExists: ValidatorHandler = async (params, ctx) => {
  const node = requireStringParam(params, 'node');
  const collection = requireStringParam(params, 'collection');
  const database = optionalStringParam(params, 'database', DEFAULT_DATABASE);

  const containers = await ctx.getContainers();
  const resolved = resolveRunningContainer(containers, node, ['mongo', 'nosql'], 'MongoDB');
  if ('outcome' in resolved) return resolved.outcome;

  const output = await ctx.executeMongoCommand(
    resolved.container.id,
    `JSON.stringify(db.getSiblingDB('${escapeJsStringLiteral(database)}').getCollectionNames())`
  );

  if (output.startsWith('ERROR')) {
    return {
      status: 'fail',
      message: `MongoDB on "${node}" is still starting up. Wait a few seconds and try again.`,
      expected: `collection "${collection}" in database "${database}"`,
      observed: 'database not ready yet',
    };
  }

  let collections: string[];
  try {
    collections = JSON.parse(output);
  } catch {
    collections = [];
  }

  if (!collections.includes(collection)) {
    return {
      status: 'fail',
      message: `No collection named "${collection}" exists in the "${database}" database on "${node}" yet.`,
      expected: `collection "${collection}"`,
      observed: collections.length > 0 ? `collections found: ${collections.join(', ')}` : 'no collections yet',
    };
  }

  return {
    status: 'pass',
    message: `Collection "${collection}" exists in the "${database}" database on "${node}".`,
  };
};
