import { tableExists } from './tableExists';
import { InvalidParamsError } from '../types';
import { makeContainer, makeContext } from './testSupport';

const postgresContainer = makeContainer({ id: 'pg-1', name: 'db', type: 'postgres' });

describe('tableExists', () => {
  it('passes when the table exists in the public schema', async () => {
    const outcome = await tableExists(
      { node: 'db', table: 'users' },
      makeContext({
        containers: [postgresContainer],
        executePsqlCommand: () => Promise.resolve('1\n'),
      })
    );

    expect(outcome.status).toBe('pass');
    expect(outcome.message).toContain('"users"');
  });

  it('fails when the table does not exist', async () => {
    const outcome = await tableExists(
      { node: 'db', table: 'users' },
      makeContext({
        containers: [postgresContainer],
        executePsqlCommand: () => Promise.resolve(''),
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('no such table');
  });

  it('fails pedagogically when the database is still starting up', async () => {
    const outcome = await tableExists(
      { node: 'db', table: 'users' },
      makeContext({
        containers: [postgresContainer],
        executePsqlCommand: () =>
          Promise.resolve('ERROR: Database server is still starting up. Please wait 5-10 seconds.'),
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('database not ready yet');
  });

  it('fails when the node is not a Postgres node', async () => {
    const outcome = await tableExists(
      { node: 'db', table: 'users' },
      makeContext({ containers: [makeContainer({ name: 'db', type: 'redis' })] })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('not a PostgreSQL node');
  });

  it('throws InvalidParamsError when "table" is missing', async () => {
    await expect(tableExists({ node: 'db' }, makeContext())).rejects.toThrow(InvalidParamsError);
  });
});
