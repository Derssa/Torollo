import { buildCidrCorrections, applyCidrCorrections } from './cidrCorrections';

const baseConfig = () => ({
  vpcConfig: { name: 'Main Network', cidr: '10.0.0.0/16' },
  subnets: [
    {
      id: 'subnet-1',
      cidr: '10.0.1.0/24',
      routes: [{ destination: '10.0.0.0/16', target: 'local' }]
    },
    { id: 'subnet-2', cidr: '10.0.2.0/24', routes: [] }
  ],
  nodeSubnetMap: { 'node-a': 'subnet-1' },
  nodeSecurityGroups: {},
  nodeIpMap: { 'node-a': '10.0.1.2' }
});

describe('buildCidrCorrections', () => {
  it('returns null when resolved values echo the requested config', () => {
    const config = baseConfig();
    const patch = buildCidrCorrections(
      config,
      '10.0.0.0/16',
      { 'subnet-1': '10.0.1.0/24', 'subnet-2': '10.0.2.0/24' },
      { 'node-a': '10.0.1.2' }
    );

    expect(patch).toBeNull();
  });

  it('includes only the values that actually shifted', () => {
    const config = baseConfig();
    const patch = buildCidrCorrections(
      config,
      '10.112.0.0/16',
      { 'subnet-1': '10.112.1.0/24', 'subnet-2': '10.0.2.0/24' },
      { 'node-a': '10.112.1.2' }
    );

    expect(patch).toEqual({
      vpcCidr: '10.112.0.0/16',
      subnetCidrs: { 'subnet-1': '10.112.1.0/24' },
      nodeIps: { 'node-a': '10.112.1.2' }
    });
  });

  it('heals stale local routes even when the VPC CIDR did not shift in this run', () => {
    // A subnet added after a shift was already persisted still carries the
    // default 10.0.0.0/16 local route while the VPC sits at 10.112.0.0/16.
    const config = {
      vpcConfig: { name: 'Main Network', cidr: '10.112.0.0/16' },
      subnets: [
        { id: 'subnet-1', cidr: '10.112.1.0/24', routes: [{ destination: '10.112.0.0/16', target: 'local' }] },
        { id: 'subnet-2', cidr: '10.0.2.0/24', routes: [{ destination: '10.0.0.0/16', target: 'local' }] }
      ],
      nodeIpMap: {}
    };

    const patch = buildCidrCorrections(
      config,
      '10.112.0.0/16',
      { 'subnet-1': '10.112.1.0/24', 'subnet-2': '10.112.2.0/24' },
      {}
    );

    expect(patch).toEqual({
      vpcCidr: '10.112.0.0/16',
      subnetCidrs: { 'subnet-2': '10.112.2.0/24' },
      nodeIps: {}
    });

    applyCidrCorrections(config, patch!);
    expect(config.subnets[1].routes[0].destination).toBe('10.112.0.0/16');
    expect(config.subnets[1].cidr).toBe('10.112.2.0/24');
  });

  it('reports newly assigned IPs missing from nodeIpMap', () => {
    const config = baseConfig();
    const patch = buildCidrCorrections(
      config,
      '10.0.0.0/16',
      { 'subnet-1': '10.0.1.0/24' },
      { 'node-a': '10.0.1.2', 'node-b': '10.0.1.3' }
    );

    expect(patch).toEqual({
      subnetCidrs: {},
      nodeIps: { 'node-b': '10.0.1.3' }
    });
  });
});

describe('applyCidrCorrections', () => {
  it('overlays corrections onto a newer config without touching other fields', () => {
    // Simulates a save that landed while the plan was running: the user added
    // a security-group rule and a subnet after enforcement started.
    const newerConfig = baseConfig();
    (newerConfig.nodeSecurityGroups as any)['node-a'] = [
      { type: 'inbound', source: '0.0.0.0/0', protocol: 'tcp', port: '80' }
    ];
    newerConfig.subnets.push({ id: 'subnet-3', cidr: '10.0.3.0/24', routes: [] });

    applyCidrCorrections(newerConfig, {
      vpcCidr: '10.112.0.0/16',
      subnetCidrs: { 'subnet-1': '10.112.1.0/24' },
      nodeIps: { 'node-a': '10.112.1.2' }
    });

    expect(newerConfig.vpcConfig.cidr).toBe('10.112.0.0/16');
    expect(newerConfig.subnets[0].cidr).toBe('10.112.1.0/24');
    expect(newerConfig.subnets[0].routes[0].destination).toBe('10.112.0.0/16');
    expect(newerConfig.nodeIpMap['node-a']).toBe('10.112.1.2');
    // The newer edits survive the merge.
    expect((newerConfig.nodeSecurityGroups as any)['node-a']).toHaveLength(1);
    expect(newerConfig.subnets[2]).toEqual({ id: 'subnet-3', cidr: '10.0.3.0/24', routes: [] });
    expect(newerConfig.subnets[1].cidr).toBe('10.0.2.0/24');
  });

  it('leaves local routes untouched when the VPC CIDR did not shift', () => {
    const config = baseConfig();

    applyCidrCorrections(config, {
      subnetCidrs: { 'subnet-2': '10.112.2.0/24' },
      nodeIps: {}
    });

    expect(config.subnets[0].routes[0].destination).toBe('10.0.0.0/16');
    expect(config.subnets[1].cidr).toBe('10.112.2.0/24');
  });

  it('ignores corrections for subnets deleted in the meantime', () => {
    const config = baseConfig();
    config.subnets = config.subnets.filter(s => s.id !== 'subnet-1');

    expect(() =>
      applyCidrCorrections(config, {
        subnetCidrs: { 'subnet-1': '10.112.1.0/24' },
        nodeIps: {}
      })
    ).not.toThrow();
    expect(config.subnets).toHaveLength(1);
  });
});
