import { lbUpstreams } from './lbUpstreams';
import { InvalidParamsError } from '../types';
import { makeContainer, makeContext } from './testSupport';

const lb = makeContainer({ id: 'lb-1', name: 'lb', type: 'loadbalancer' });
const target1 = makeContainer({ id: 'app-1', name: 'app-1' });
const target2 = makeContainer({ id: 'app-2', name: 'app-2', state: 'exited' });

describe('lbUpstreams', () => {
  it('passes when at least "min" targets are running', async () => {
    const outcome = await lbUpstreams(
      { node: 'lb', min: 1 },
      makeContext({
        containers: [lb, target1],
        networkConfig: { loadBalancerTargets: { 'lb-1': ['app-1'] } },
      })
    );

    expect(outcome.status).toBe('pass');
  });

  it('fails when fewer targets are running than "min"', async () => {
    const outcome = await lbUpstreams(
      { node: 'lb', min: 2 },
      makeContext({
        containers: [lb, target1, target2],
        networkConfig: { loadBalancerTargets: { 'lb-1': ['app-1', 'app-2'] } },
      })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('1 running upstream target(s)');
  });

  it('counts running ASG replicas as upstream targets', async () => {
    const asgReplica = makeContainer({ id: 'r1', name: 'r1', asgId: 'asg-1', isAsgInstance: true });
    const outcome = await lbUpstreams(
      { node: 'lb', min: 1 },
      makeContext({
        containers: [lb, asgReplica],
        networkConfig: {
          loadBalancerTargets: { 'lb-1': ['asg-1'] },
          asgs: { 'asg-1': { parentId: 'template-1' } },
        },
      })
    );

    expect(outcome.status).toBe('pass');
  });

  it('treats no network config as zero upstreams', async () => {
    const outcome = await lbUpstreams(
      { node: 'lb', min: 1 },
      makeContext({ containers: [lb], networkConfig: null })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('0 running upstream target(s)');
  });

  it('fails when the node is not a load balancer', async () => {
    const outcome = await lbUpstreams(
      { node: 'lb', min: 1 },
      makeContext({ containers: [makeContainer({ name: 'lb', type: 'redis' })] })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.message).toContain('not a load balancer node');
  });

  it('throws InvalidParamsError when "min" is missing', async () => {
    await expect(lbUpstreams({ node: 'lb' }, makeContext())).rejects.toThrow(InvalidParamsError);
  });
});
