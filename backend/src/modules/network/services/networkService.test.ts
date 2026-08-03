import { NetworkService } from './networkService';
import { NetworkConfigInput, SecurityGroupRuleInput, SemanticRule } from '../models/networkPolicy';
import { DockerContainerFixture, makeDockerContainer, makeNetworkConfig } from '../testSupport';

// `computeSemanticRules` lists containers to resolve ASG replicas. A plain
// async function reading a mutable array, not a `jest.fn()`: `resetMocks`
// would wipe a `mockResolvedValue` between tests.
let mockDockerContainers: DockerContainerFixture[] = [];
jest.mock('../../../infrastructure/docker/DockerClient', () => ({
  __esModule: true,
  default: { listContainers: async () => mockDockerContainers },
}));

beforeEach(() => {
  mockDockerContainers = [];
});

const compute = (config: NetworkConfigInput): Promise<SemanticRule[]> =>
  NetworkService.computeSemanticRules('project-1', config);

/** Compact, order-sensitive projection: `web→db tcp/5432 ALLOW inbound (owner db)`. */
const fmt = (r: SemanticRule): string =>
  `${r.sourceNodeId}→${r.targetNodeId} ${r.protocol}/${r.port} ${r.action} ${r.direction} (owner ${r.ownerNodeId})`;

const ownedBy = (rules: SemanticRule[], nodeId: string): string[] =>
  rules.filter((r) => r.ownerNodeId === nodeId).map(fmt);

/**
 * The rules a node's own security group produced, in order, for one direction.
 * The UI prepends new rules, so the learner's rules open the block and the two
 * default ones close it.
 */
const blockOf = (rules: SemanticRule[], nodeId: string, direction: 'inbound' | 'outbound'): string[] =>
  rules.filter((r) => r.ownerNodeId === nodeId && r.direction === direction).map(fmt);

describe('computeSemanticRules — default security groups', () => {
  it('expands the two default rules of every node into a pairwise matrix', async () => {
    const rules = await compute(makeNetworkConfig(['web', 'db']));

    // Per node: one outbound block (allow all, + its icmp twin) then one
    // inbound block (deny all, + its icmp twin), against every other node.
    expect(rules.map(fmt)).toEqual([
      'web→db all/ALL ALLOW outbound (owner web)',
      'web→db icmp/ALL ALLOW outbound (owner web)',
      'db→web all/ALL DENY inbound (owner web)',
      'db→web icmp/ALL DENY inbound (owner web)',
      'db→web all/ALL ALLOW outbound (owner db)',
      'db→web icmp/ALL ALLOW outbound (owner db)',
      'web→db all/ALL DENY inbound (owner db)',
      'web→db icmp/ALL DENY inbound (owner db)',
    ]);
  });

  it('emits every ordered pair when more than two nodes share a subnet', async () => {
    const rules = await compute(makeNetworkConfig(['web', 'db', 'cache']));

    // 3 nodes × 2 peers × 2 directions × 2 (rule + icmp twin).
    expect(rules).toHaveLength(24);
    expect(rules.some((r) => r.sourceNodeId === r.targetNodeId)).toBe(false);
  });

  it('never makes a node a peer of itself on a 0.0.0.0/0 rule', async () => {
    const rules = await compute(makeNetworkConfig(['web']));

    expect(rules).toEqual([]);
  });
});

describe('computeSemanticRules — normalization', () => {
  const withDbRule = (rule: SecurityGroupRuleInput) =>
    compute(makeNetworkConfig(['web', 'db'], { db: [rule] }));

  const learnerRule = (rules: SemanticRule[]): string[] => blockOf(rules, 'db', 'inbound').slice(0, 1);

  it('lowercases the protocol', async () => {
    const rules = await withDbRule({ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'web' });

    expect(learnerRule(rules)).toEqual(['web→db tcp/5432 ALLOW inbound (owner db)']);
  });

  it('defaults a missing action to ALLOW and a missing protocol to all', async () => {
    const rules = await withDbRule({ type: 'inbound', port: '5432', source: 'web' });

    expect(learnerRule(rules)).toEqual(['web→db all/5432 ALLOW inbound (owner db)']);
  });

  it('normalizes a missing port and any casing of "all" to ALL', async () => {
    const missing = await withDbRule({ type: 'inbound', action: 'ALLOW', protocol: 'TCP', source: 'web' });
    const lowercase = await withDbRule({ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: 'all', source: 'web' });

    expect(learnerRule(missing)).toEqual(['web→db tcp/ALL ALLOW inbound (owner db)']);
    expect(learnerRule(lowercase)).toEqual(['web→db tcp/ALL ALLOW inbound (owner db)']);
  });

  it('forces ICMP rules to port ALL even when the canvas carried a port', async () => {
    const rules = await withDbRule({ type: 'inbound', action: 'ALLOW', protocol: 'ICMP', port: '8080', source: 'web' });

    expect(learnerRule(rules)).toEqual(['web→db icmp/ALL ALLOW inbound (owner db)']);
  });
});

describe('computeSemanticRules — the ICMP twin', () => {
  it('duplicates an all/ALL rule into an icmp twin placed right after it', async () => {
    const rules = await compute(
      makeNetworkConfig(['web', 'db'], {
        db: [{ type: 'inbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: 'web' }],
      })
    );

    expect(blockOf(rules, 'db', 'inbound').slice(0, 2)).toEqual([
      'web→db all/ALL ALLOW inbound (owner db)',
      'web→db icmp/ALL ALLOW inbound (owner db)',
    ]);
  });

  it('emits no twin when the rule names a protocol or a port', async () => {
    const scopedProtocol = await compute(
      makeNetworkConfig(['web', 'db'], {
        db: [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: 'ALL', source: 'web' }],
      })
    );
    const scopedPort = await compute(
      makeNetworkConfig(['web', 'db'], {
        db: [{ type: 'inbound', action: 'ALLOW', protocol: 'ALL', port: '5432', source: 'web' }],
      })
    );

    // The default DENY all/ALL that follows is what carries the only twin here.
    expect(blockOf(scopedProtocol, 'db', 'inbound').slice(0, 2)).toEqual([
      'web→db tcp/ALL ALLOW inbound (owner db)',
      'web→db all/ALL DENY inbound (owner db)',
    ]);
    expect(blockOf(scopedPort, 'db', 'inbound').slice(0, 2)).toEqual([
      'web→db all/5432 ALLOW inbound (owner db)',
      'web→db all/ALL DENY inbound (owner db)',
    ]);
  });
});

describe('computeSemanticRules — source expansion', () => {
  const twoSubnets = (learnerRules: Record<string, SecurityGroupRuleInput[]>) =>
    makeNetworkConfig(['web', 'api', 'db'], learnerRules, {
      web: 'subnet-public',
      api: 'subnet-public',
      db: 'subnet-private',
    });

  it('expands a subnet source to every node of that subnet', async () => {
    const rules = await compute(
      twoSubnets({ db: [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'subnet-public' }] })
    );

    expect(blockOf(rules, 'db', 'inbound').slice(0, 2)).toEqual([
      'web→db tcp/5432 ALLOW inbound (owner db)',
      'api→db tcp/5432 ALLOW inbound (owner db)',
    ]);
  });

  it('includes the owner itself when it sits in the subnet it names (unlike 0.0.0.0/0)', async () => {
    const rules = await compute(
      twoSubnets({ web: [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '80', source: 'subnet-public' }] })
    );

    // The 0.0.0.0/0 branch skips self; the subnet branch does not.
    expect(blockOf(rules, 'web', 'inbound').slice(0, 2)).toEqual([
      'web→web tcp/80 ALLOW inbound (owner web)',
      'api→web tcp/80 ALLOW inbound (owner web)',
    ]);
  });

  it('matches subnets exactly, never across subnets', async () => {
    const rules = await compute(
      twoSubnets({ web: [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '80', source: 'subnet-private' }] })
    );

    expect(blockOf(rules, 'web', 'inbound').slice(0, 1)).toEqual(['db→web tcp/80 ALLOW inbound (owner web)']);
  });

  it('treats a subnet id without the "subnet-" prefix as a node id', async () => {
    // Real configs exist with bare subnet ids ('public'/'private'): they fall
    // into the node-id branch and produce a single rule against a node that
    // does not exist, silently matching nothing at enforcement time.
    const rules = await compute(
      makeNetworkConfig(['web', 'db'], { db: [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'public' }] },
        { web: 'public', db: 'private' })
    );

    expect(blockOf(rules, 'db', 'inbound').slice(0, 1)).toEqual(['public→db tcp/5432 ALLOW inbound (owner db)']);
  });

  it('keeps a rule pointing at an unknown node id as-is', async () => {
    const rules = await compute(
      makeNetworkConfig(['web', 'db'], {
        db: [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'deleted-node' }],
      })
    );

    expect(blockOf(rules, 'db', 'inbound').slice(0, 1)).toEqual(['deleted-node→db tcp/5432 ALLOW inbound (owner db)']);
  });

  it('ignores security groups of nodes that are not placed in a subnet', async () => {
    const config = makeNetworkConfig(['web', 'db']);
    config.nodeSecurityGroups!['orphan'] = [
      { type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '22', source: 'web' },
    ];

    const rules = await compute(config);

    // `nodeSubnetMap` is the node inventory: an unplaced node is never an owner.
    expect(ownedBy(rules, 'orphan')).toEqual([]);
  });

  it('expands an outbound rule the same way as an inbound one, with the owner as source', async () => {
    const rules = await compute(
      makeNetworkConfig(['web', 'db'], {
        web: [{ type: 'outbound', action: 'DENY', protocol: 'TCP', port: '5432', source: 'db' }],
      })
    );

    expect(blockOf(rules, 'web', 'outbound').slice(0, 1)).toEqual(['web→db tcp/5432 DENY outbound (owner web)']);
  });
});

describe('computeSemanticRules — rule order is rule priority', () => {
  // Enforcement (append-only iptables + final REJECT) and both connectivity
  // validators walk these rules first-match-wins, so the output order IS the
  // policy. The UI prepends new rules, hence the DENY-above-ALLOW shape here.
  const shadowedConfig = makeNetworkConfig(['web', 'cache'], {
    cache: [
      { type: 'inbound', action: 'DENY', protocol: 'TCP', port: '6379', source: 'web' },
      { type: 'inbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: 'web' },
    ],
  });

  it('preserves the security group order, so a narrow DENY shadows a later broad ALLOW', async () => {
    const rules = await compute(shadowedConfig);

    expect(blockOf(rules, 'cache', 'inbound')).toEqual([
      'web→cache tcp/6379 DENY inbound (owner cache)',
      'web→cache all/ALL ALLOW inbound (owner cache)',
      'web→cache icmp/ALL ALLOW inbound (owner cache)',
      'web→cache all/ALL DENY inbound (owner cache)',
      'web→cache icmp/ALL DENY inbound (owner cache)',
    ]);
  });

  it('places the DENY on 6379 before the ALLOW that would otherwise open it', async () => {
    const rules = await compute(shadowedConfig);
    const inbound = rules.filter((r) => r.direction === 'inbound' && r.targetNodeId === 'cache');

    const deny = inbound.findIndex((r) => r.action === 'DENY' && r.port === '6379');
    const allow = inbound.findIndex((r) => r.action === 'ALLOW' && r.port === 'ALL');

    expect(deny).toBeGreaterThanOrEqual(0);
    expect(allow).toBeGreaterThan(deny);
  });

  it('emits a node\'s whole outbound block before its inbound block', async () => {
    const rules = await compute(makeNetworkConfig(['web', 'db']));
    const web = rules.filter((r) => r.ownerNodeId === 'web');

    expect(web.findIndex((r) => r.direction === 'inbound')).toBe(
      web.filter((r) => r.direction === 'outbound').length
    );
  });
});

describe('computeSemanticRules — ASG replicas', () => {
  const replicaConfig = (): NetworkConfigInput => {
    const config = makeNetworkConfig(['web', 'replica-a', 'replica-b']);
    // Rules are authored on the ASG's parent node, which is not itself placed.
    config.nodeSecurityGroups!['asg-parent'] = [
      { type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '80', source: 'web' },
    ];
    config.asgs = { 'asg-1': { parentId: 'asg-parent' } };
    return config;
  };

  it('makes a replica inherit the security group of its ASG parent node', async () => {
    mockDockerContainers = [
      makeDockerContainer({ Id: 'replica-a', Labels: { 'akal.asg.id': 'asg-1' } }),
      makeDockerContainer({ Id: 'replica-b', Labels: { 'akal.asg.id': 'asg-1' } }),
    ];

    const rules = await compute(replicaConfig());

    expect(ownedBy(rules, 'replica-a')).toEqual(['web→replica-a tcp/80 ALLOW inbound (owner replica-a)']);
    expect(ownedBy(rules, 'replica-b')).toEqual(['web→replica-b tcp/80 ALLOW inbound (owner replica-b)']);
  });

  it('matches a replica listed under its short container id', async () => {
    const config = replicaConfig();
    config.nodeSubnetMap = { web: 'subnet-public-1', '0123456789ab': 'subnet-public-1' };
    mockDockerContainers = [
      makeDockerContainer({ Id: '0123456789abcdef', Labels: { 'akal.asg.id': 'asg-1' } }),
    ];

    const rules = await compute(config);

    expect(ownedBy(rules, '0123456789ab')).toEqual([
      'web→0123456789ab tcp/80 ALLOW inbound (owner 0123456789ab)',
    ]);
  });

  it('falls back to the default group when the replica has no matching ASG config', async () => {
    const config = replicaConfig();
    config.asgs = {}; // scaled while the config was stale
    mockDockerContainers = [makeDockerContainer({ Id: 'replica-a', Labels: { 'akal.asg.id': 'asg-1' } })];

    const rules = await compute(config);

    // Its own (default) group applies: deny all inbound, allow all outbound.
    expect(ownedBy(rules, 'replica-a')).toContain('replica-a→web all/ALL ALLOW outbound (owner replica-a)');
    expect(ownedBy(rules, 'replica-a')).toContain('web→replica-a all/ALL DENY inbound (owner replica-a)');
  });

  it('inherits the parent group when the ASG boundary node itself is placed on the canvas', async () => {
    const config = makeNetworkConfig(['web', 'asg-1']);
    config.nodeSecurityGroups!['asg-parent'] = [
      { type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '80', source: 'web' },
    ];
    config.asgs = { 'asg-1': { parentId: 'asg-parent' } };

    const rules = await compute(config);

    expect(ownedBy(rules, 'asg-1')).toEqual(['web→asg-1 tcp/80 ALLOW inbound (owner asg-1)']);
  });

  it('expands a rule targeting an ASG into one rule per running replica', async () => {
    mockDockerContainers = [
      makeDockerContainer({ Id: 'replica-a', Labels: { 'akal.asg.id': 'asg-1' } }),
      makeDockerContainer({ Id: 'replica-b', Labels: { 'akal.asg.id': 'asg-1' } }),
    ];

    const rules = await compute(
      makeNetworkConfig(['web', 'db'], {
        db: [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'asg-1' }],
      })
    );

    expect(blockOf(rules, 'db', 'inbound').slice(0, 2)).toEqual([
      'replica-a→db tcp/5432 ALLOW inbound (owner db)',
      'replica-b→db tcp/5432 ALLOW inbound (owner db)',
    ]);
  });

  it('leaves stopped replicas out of the expansion', async () => {
    mockDockerContainers = [
      makeDockerContainer({ Id: 'replica-a', Labels: { 'akal.asg.id': 'asg-1' } }),
      makeDockerContainer({ Id: 'replica-b', State: 'exited', Labels: { 'akal.asg.id': 'asg-1' } }),
    ];

    const rules = await compute(
      makeNetworkConfig(['web', 'db'], {
        db: [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'asg-1' }],
      })
    );

    expect(blockOf(rules, 'db', 'inbound').slice(0, 1)).toEqual(['replica-a→db tcp/5432 ALLOW inbound (owner db)']);
  });

  it('falls back to the ASG id itself when the group has scaled down to zero', async () => {
    const rules = await compute(
      makeNetworkConfig(['web', 'db'], {
        db: [{ type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'asg-1' }],
      })
    );

    expect(blockOf(rules, 'db', 'inbound').slice(0, 1)).toEqual(['asg-1→db tcp/5432 ALLOW inbound (owner db)']);
  });
});

describe('computeSemanticRules — degenerate configs', () => {
  it('returns nothing for an empty config', async () => {
    expect(await compute({})).toEqual([]);
  });

  it('returns nothing when nodes are placed but carry no security group', async () => {
    expect(await compute({ nodeSubnetMap: { web: 'subnet-public-1', db: 'subnet-public-1' } })).toEqual([]);
  });

  it('returns nothing when the security groups are empty arrays', async () => {
    expect(
      await compute({
        nodeSubnetMap: { web: 'subnet-public-1', db: 'subnet-public-1' },
        nodeSecurityGroups: { web: [], db: [] },
      })
    ).toEqual([]);
  });
});
