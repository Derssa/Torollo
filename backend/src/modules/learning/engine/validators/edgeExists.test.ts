import { edgeExists } from './edgeExists';
import { InvalidParamsError } from '../types';
import { makeContainer, makeContext, makeNetworkConfig } from './testSupport';

// `computeSemanticRules` lists containers to resolve ASG replicas — no ASGs
// here. A plain async function, not a jest.fn(): `resetMocks` would wipe a
// mockResolvedValue between tests.
jest.mock('../../../../infrastructure/docker/DockerClient', () => ({
  __esModule: true,
  default: { listContainers: async () => [] },
}));

const web = makeContainer({ id: 'web-1', name: 'web' });
const db = makeContainer({ id: 'db-1', name: 'db' });
const containers = [web, db];

describe('edgeExists', () => {
  it('fails with only the default security groups (deny all inbound)', async () => {
    const outcome = await edgeExists(
      { source: 'web', target: 'db' },
      makeContext({ containers, networkConfig: makeNetworkConfig(['web-1', 'db-1']) })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('no matching rule');
  });

  it('passes when the learner adds an ALLOW rule on the requested port', async () => {
    const outcome = await edgeExists(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers,
        networkConfig: makeNetworkConfig(['web-1', 'db-1'], {
          'db-1': [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'web-1' }],
        }),
      })
    );

    expect(outcome.status).toBe('pass');
  });

  it('passes on any port when the learner adds an ALLOW rule', async () => {
    const outcome = await edgeExists(
      { source: 'web', target: 'db' },
      makeContext({
        containers,
        networkConfig: makeNetworkConfig(['web-1', 'db-1'], {
          'db-1': [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'web-1' }],
        }),
      })
    );

    expect(outcome.status).toBe('pass');
  });

  it('fails when the ALLOW rule is for a different port (default DENY applies)', async () => {
    const outcome = await edgeExists(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers,
        networkConfig: makeNetworkConfig(['web-1', 'db-1'], {
          'db-1': [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '80', source: 'web-1' }],
        }),
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('blocked by a DENY rule');
  });

  it('fails when a DENY rule blocks the port despite a broader ALLOW below it', async () => {
    const config = makeNetworkConfig(['web-1', 'db-1'], {
      'db-1': [
        { type: 'inbound', action: 'DENY', protocol: 'TCP', port: '5432', source: 'web-1' },
        { type: 'inbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: 'web-1' },
      ],
    });

    const denied = await edgeExists(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({ containers, networkConfig: config })
    );
    expect(denied.status).toBe('fail');
    expect(denied.observed).toBe('blocked by a DENY rule');

    const otherPort = await edgeExists(
      { source: 'web', target: 'db', port: 80 },
      makeContext({ containers, networkConfig: config })
    );
    expect(otherPort.status).toBe('pass');

    const anyPort = await edgeExists(
      { source: 'web', target: 'db' },
      makeContext({ containers, networkConfig: config })
    );
    expect(anyPort.status).toBe('pass');
  });

  it('fails on any port when a DENY ALL rule shadows a later ALLOW', async () => {
    const outcome = await edgeExists(
      { source: 'web', target: 'db' },
      makeContext({
        containers,
        networkConfig: makeNetworkConfig(['web-1', 'db-1'], {
          'db-1': [
            { type: 'inbound', action: 'DENY', protocol: 'ALL', port: 'ALL', source: 'web-1' },
            { type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'web-1' },
          ],
        }),
      })
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
