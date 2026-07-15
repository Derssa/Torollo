import { mongoCollectionExists } from './mongoCollectionExists';
import { InvalidParamsError } from '../types';
import { makeContainer, makeContext } from './testSupport';

const mongoContainer = makeContainer({ id: 'mongo-1', name: 'db', type: 'mongo' });

describe('mongoCollectionExists', () => {
  it('passes when the collection exists', async () => {
    const outcome = await mongoCollectionExists(
      { node: 'db', collection: 'orders' },
      makeContext({
        containers: [mongoContainer],
        executeMongoCommand: () => Promise.resolve(JSON.stringify(['orders', 'users'])),
      })
    );

    expect(outcome.status).toBe('pass');
  });

  it('fails when the collection does not exist', async () => {
    const outcome = await mongoCollectionExists(
      { node: 'db', collection: 'orders' },
      makeContext({
        containers: [mongoContainer],
        executeMongoCommand: () => Promise.resolve(JSON.stringify(['users'])),
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toContain('users');
  });

  it('uses the "database" param when given', async () => {
    const executeMongoCommand = jest.fn(() => Promise.resolve(JSON.stringify(['orders'])));
    await mongoCollectionExists(
      { node: 'db', collection: 'orders', database: 'shop' },
      makeContext({ containers: [mongoContainer], executeMongoCommand })
    );

    expect(executeMongoCommand).toHaveBeenCalledWith('mongo-1', expect.stringContaining("'shop'"));
  });

  it('fails pedagogically when MongoDB is still starting up', async () => {
    const outcome = await mongoCollectionExists(
      { node: 'db', collection: 'orders' },
      makeContext({
        containers: [mongoContainer],
        executeMongoCommand: () => Promise.resolve('ERROR: Database server is still starting up.'),
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('database not ready yet');
  });

  it('fails when the node is not a MongoDB node', async () => {
    const outcome = await mongoCollectionExists(
      { node: 'db', collection: 'orders' },
      makeContext({ containers: [makeContainer({ name: 'db', type: 'redis' })] })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('not a MongoDB node');
  });

  it('throws InvalidParamsError when "collection" is missing', async () => {
    await expect(mongoCollectionExists({ node: 'db' }, makeContext())).rejects.toThrow(
      InvalidParamsError
    );
  });
});
