import { portDenied } from './portDenied';
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

describe('portDenied', () => {
  it('fails when no network configuration is applied to the project', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({ containers, networkConfig: null })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('no network configuration applied');
  });

  it('fails when one of the nodes is outside any subnet', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({ containers, networkConfig: makeNetworkConfig(['db-1']) })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('"web" is outside any subnet');
  });

  it('passes with only the default security groups (deny all inbound)', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({ containers, networkConfig: makeNetworkConfig(['web-1', 'db-1']) })
    );

    expect(outcome.status).toBe('pass');
  });

  it('fails when an ALLOW rule explicitly opens the port', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers,
        networkConfig: makeNetworkConfig(['web-1', 'db-1'], {
          'db-1': [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'web-1' }],
        }),
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('Port 5432 is still open');
  });

  it('fails when an ALLOW rule opens all ports', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers,
        networkConfig: makeNetworkConfig(['web-1', 'db-1'], {
          'db-1': [{ type: 'inbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: 'web-1' }],
        }),
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toContain('all ports are allowed');
  });

  it('passes when the ALLOW rule is for a different port', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers,
        networkConfig: makeNetworkConfig(['web-1', 'db-1'], {
          'db-1': [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '80', source: 'web-1' }],
        }),
      })
    );

    expect(outcome.status).toBe('pass');
  });

  it('passes when a DENY rule blocks the port despite a broader ALLOW below it', async () => {
    const outcome = await portDenied(
      { source: 'web', target: 'db', port: 5432 },
      makeContext({
        containers,
        networkConfig: makeNetworkConfig(['web-1', 'db-1'], {
          'db-1': [
            { type: 'inbound', action: 'DENY', protocol: 'TCP', port: '5432', source: 'web-1' },
            { type: 'inbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: 'web-1' },
          ],
        }),
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
