import { asgReplicas } from './asgReplicas';
import { InvalidParamsError } from '../types';
import { makeContainer, makeContext } from './testSupport';

const asg = makeContainer({ id: 'asg-1', name: 'web-fleet', type: 'autoscalinggroup' });

function makeReplica(id: string, state = 'running') {
  return makeContainer({ id, name: id, asgId: 'asg-1', isAsgInstance: true, state });
}

describe('asgReplicas', () => {
  it('passes when the running replica count matches exactly', async () => {
    const outcome = await asgReplicas(
      { node: 'web-fleet', count: 2 },
      makeContext({ containers: [asg, makeReplica('r1'), makeReplica('r2')] })
    );

    expect(outcome.status).toBe('pass');
  });

  it('fails when there are fewer running replicas than expected', async () => {
    const outcome = await asgReplicas(
      { node: 'web-fleet', count: 2 },
      makeContext({ containers: [asg, makeReplica('r1')] })
    );

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('1 replica(s)');
  });

  it('does not count stopped replicas', async () => {
    const outcome = await asgReplicas(
      { node: 'web-fleet', count: 1 },
      makeContext({ containers: [asg, makeReplica('r1'), makeReplica('r2', 'exited')] })
    );

    expect(outcome.status).toBe('pass');
  });

  it('fails when the ASG node does not exist', async () => {
    const outcome = await asgReplicas({ node: 'web-fleet', count: 1 }, makeContext({ containers: [] }));

    expect(outcome.status).toBe('fail');
    expect(outcome.observed).toBe('no container with that name');
  });

  it('throws InvalidParamsError when "count" is missing', async () => {
    await expect(asgReplicas({ node: 'web-fleet' }, makeContext())).rejects.toThrow(
      InvalidParamsError
    );
  });
});
