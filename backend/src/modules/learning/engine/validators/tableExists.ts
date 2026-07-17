import { ValidatorHandler } from '../types';
import { requireStringParam } from '../params';
import { resolveRunningContainer } from './shared';

/** Postgres nodes only ever provision the default `postgres` database. */
const DEFAULT_DATABASE = 'postgres';

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

/**
 * `table_exists` — checks that a table exists in the `public` schema of a
 * node's PostgreSQL. Params: `{ node: string, table: string }` (docs/roadmap-format.md).
 */
export const tableExists: ValidatorHandler = async (params, ctx) => {
  const node = requireStringParam(params, 'node');
  const table = requireStringParam(params, 'table');

  const containers = await ctx.getContainers();
  const resolved = resolveRunningContainer(containers, node, ['postgres', 'sql'], 'PostgreSQL');
  if ('outcome' in resolved) return resolved.outcome;

  const output = await ctx.executePsqlCommand(
    resolved.container.id,
    DEFAULT_DATABASE,
    `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '${escapeSqlLiteral(table)}';`,
    ['-t', '-A']
  );

  if (output.startsWith('ERROR')) {
    return {
      status: 'fail',
      message: `PostgreSQL on "${node}" is still starting up. Wait a few seconds and try again.`,
      expected: `table "${table}"`,
      observed: 'database not ready yet',
    };
  }

  // The query yields exactly `1` when the table exists — anything else (empty,
  // or psql WARNING/NOTICE noise merged into the output) is not a proof.
  if (output.trim() !== '1') {
    return {
      status: 'fail',
      message: `No table named "${table}" exists in PostgreSQL on "${node}" yet.`,
      expected: `table "${table}"`,
      observed: 'no such table',
    };
  }

  return { status: 'pass', message: `Table "${table}" exists in PostgreSQL on "${node}".` };
};
