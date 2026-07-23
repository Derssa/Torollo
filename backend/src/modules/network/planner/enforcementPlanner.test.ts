import { EnforcementPlanner } from './enforcementPlanner';
import { SemanticRule } from '../models/networkPolicy';

const rule = (overrides: Partial<SemanticRule> = {}): SemanticRule => ({
  sourceNodeId: 'web',
  targetNodeId: 'db',
  protocol: 'tcp',
  port: '5432',
  action: 'ALLOW',
  direction: 'inbound',
  ownerNodeId: 'db',
  ...overrides,
});

describe('EnforcementPlanner', () => {
  it('compiles an ALLOW rule into an ALLOW_CONNECTION intent, field for field', () => {
    const intents = EnforcementPlanner.plan('project-1', [rule()]);

    expect(intents[0]).toEqual({
      type: 'ALLOW_CONNECTION',
      sourceNodeId: 'web',
      targetNodeId: 'db',
      protocol: 'tcp',
      port: '5432',
      direction: 'inbound',
      ownerNodeId: 'db',
    });
  });

  it('compiles a DENY rule into a DENY_CONNECTION intent', () => {
    const intents = EnforcementPlanner.plan('project-1', [rule({ action: 'DENY' })]);

    expect(intents[0]).toMatchObject({ type: 'DENY_CONNECTION', port: '5432' });
  });

  it('treats anything that is not exactly ALLOW as a denial (fail closed)', () => {
    const intents = EnforcementPlanner.plan('project-1', [rule({ action: 'allow' as SemanticRule['action'] })]);

    expect(intents[0]!.type).toBe('DENY_CONNECTION');
  });

  it('always appends the terminal zero-trust DENY_ALL last', () => {
    const intents = EnforcementPlanner.plan('project-1', [rule(), rule({ action: 'DENY' })]);

    expect(intents).toHaveLength(3);
    expect(intents[intents.length - 1]).toEqual({ type: 'DENY_ALL' });
  });

  it('plans a DENY_ALL even with no rules at all', () => {
    expect(EnforcementPlanner.plan('project-1', [])).toEqual([{ type: 'DENY_ALL' }]);
  });

  it('preserves rule order — the plan is walked first-match-wins downstream', () => {
    const intents = EnforcementPlanner.plan('project-1', [
      rule({ action: 'DENY', port: '6379' }),
      rule({ action: 'ALLOW', port: 'ALL' }),
    ]);

    expect(intents.map((i) => `${i.type}/${i.port ?? '-'}`)).toEqual([
      'DENY_CONNECTION/6379',
      'ALLOW_CONNECTION/ALL',
      'DENY_ALL/-',
    ]);
  });

  it('keeps outbound rules distinguishable from inbound ones', () => {
    const intents = EnforcementPlanner.plan('project-1', [
      rule({ direction: 'outbound', ownerNodeId: 'web' }),
    ]);

    expect(intents[0]).toMatchObject({ direction: 'outbound', ownerNodeId: 'web' });
  });
});
