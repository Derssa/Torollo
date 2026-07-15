import { edgeExists } from './edgeExists';
import { InvalidParamsError } from '../types';
import { makeContainer, makeContext, makeSemanticRule } from './testSupport';

const web = makeContainer({ id: 'web-1', name: 'web' });
const db = makeContainer({ id: 'db-1', name: 'db' });

describe('edgeExists', () => {
  it('passes when an ALLOW rule matches source and target on any port', async () => {
    const outcome = await edgeExists(
      { source: 'web', target: 'db' },
      makeContext({
        containers: [web, db],
        semanticRules: [makeSemanticRule({ sourceNodeId: 'web-1', targetNodeId: 'db-1' })],
      })
    );

    expect(outcome.status).toBe('pass');
  });

  it('passes when the ALLOW rule matches the requested port', async () => {
    const outcome = await edgeExists(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers: [web, db],
        semanticRules: [
          makeSemanticRule({ sourceNodeId: 'web-1', targetNodeId: 'db-1', port: '5432' }),
        ],
      })
    );

    expect(outcome.status).toBe('pass');
  });

  it('fails when the ALLOW rule is for a different port', async () => {
    const outcome = await edgeExists(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers: [web, db],
        semanticRules: [
          makeSemanticRule({ sourceNodeId: 'web-1', targetNodeId: 'db-1', port: '80' }),
        ],
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('no matching rule');
  });

  it('fails when no rule matches source and target at all', async () => {
    const outcome = await edgeExists(
      { source: 'web', target: 'db' },
      makeContext({ containers: [web, db], semanticRules: [] })
    );

    expect(outcome.status).toBe('fail');
  });

  it('fails when the source node does not exist', async () => {
    const outcome = await edgeExists(
      { source: 'web', target: 'db' },
      makeContext({ containers: [db] })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('"web" does not exist');
  });

  it('throws InvalidParamsError when "target" is missing', async () => {
    await expect(edgeExists({ source: 'web' }, makeContext())).rejects.toThrow(
      InvalidParamsError
    );
  });
});
