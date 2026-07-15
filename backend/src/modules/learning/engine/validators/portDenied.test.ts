import { portDenied } from './portDenied';
import { InvalidParamsError } from '../types';
import { makeContainer, makeContext, makeSemanticRule } from './testSupport';

const web = makeContainer({ id: 'web-1', name: 'web' });
const db = makeContainer({ id: 'db-1', name: 'db' });

describe('portDenied', () => {
  it('passes when no ALLOW rule covers the port', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({ containers: [web, db], semanticRules: [] })
    );

    expect(outcome.status).toBe('pass');
  });

  it('fails when an ALLOW rule explicitly opens the port', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers: [web, db],
        semanticRules: [
          makeSemanticRule({ sourceNodeId: 'web-1', targetNodeId: 'db-1', port: '5432' }),
        ],
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('Port 5432 is still open');
  });

  it('fails when an ALLOW rule opens all ports', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers: [web, db],
        semanticRules: [
          makeSemanticRule({ sourceNodeId: 'web-1', targetNodeId: 'db-1', port: 'ALL' }),
        ],
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toContain('all ports are allowed');
  });

  it('passes when an ALLOW rule exists for a different port', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers: [web, db],
        semanticRules: [
          makeSemanticRule({ sourceNodeId: 'web-1', targetNodeId: 'db-1', port: '80' }),
        ],
      })
    );

    expect(outcome.status).toBe('pass');
  });

  it('fails when the target node does not exist', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({ containers: [web] })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('"db" does not exist');
  });

  it('throws InvalidParamsError when "port" is missing', async () => {
    await expect(
      portDenied({ source: 'web', target: 'db' }, makeContext())
    ).rejects.toThrow(InvalidParamsError);
  });
});
