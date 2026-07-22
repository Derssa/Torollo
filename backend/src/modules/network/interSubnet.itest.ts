import docker from '../../infrastructure/docker/DockerClient';
import { containerProvider } from '../../infrastructure/docker/providers/dockerContainerProvider';
import { ProjectService } from '../projects/services/projectService';
import { NetworkService } from './services/networkService';
import { getInterSubnetStatus } from './services/interSubnetHealth';
import { runStepValidators } from '../learning/engine/engine';

/**
 * Integration tests (run with `npm run test:integration`, requires a Docker daemon).
 *
 * Real inter-subnet traffic through the full enforcement pipeline: two subnets,
 * one container in each, an ALLOW rule between them — then actual TCP across
 * the host's forward path. This is the scenario silently broken by hosts that
 * filter routed traffic between Docker bridges (Docker 28+ raw-table rules,
 * strict firewall setups): the unit suites can't see it because it only exists
 * against a real kernel. Also asserts the self-test verdict recorded during
 * `applyPolicy` and that `edge_exists` agrees with the wire.
 */

async function ensureSharedNetwork(): Promise<void> {
  const networks = await docker.listNetworks();
  if (!networks.some((n) => n.Name === 'akal-lab-network')) {
    await docker.createNetwork({ Name: 'akal-lab-network', Driver: 'bridge' });
  }
}

const DEFAULT_SG = [
  { type: 'inbound', action: 'DENY', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' },
  { type: 'outbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' },
];

/**
 * True when a TCP connect from the container to ip:port succeeds within 3s.
 * `executeCustomCommand` ignores the exit code, so the verdict is carried by
 * an output marker.
 */
async function canConnect(containerId: string, ip: string, port: number): Promise<boolean> {
  const output = await containerProvider.executeCustomCommand(containerId, [
    'bash', '-c',
    `timeout 3 bash -c 'echo probe > /dev/tcp/${ip}/${port}' 2>/dev/null && echo CONNECT-OK || echo CONNECT-FAIL`,
  ]);
  return output.includes('CONNECT-OK');
}

describe('inter-subnet enforcement — real containers', () => {
  let projectId = '';
  let webId = '';
  let dbId = '';
  let dbIp = '';
  let config: any;

  beforeAll(async () => {
    try {
      await docker.ping();
    } catch {
      throw new Error(
        'Docker daemon is not reachable. Integration tests require a running Docker daemon.'
      );
    }

    await ensureSharedNetwork();

    const project = await ProjectService.createProject('intersubnet-integration-fixture');
    projectId = project.id;

    const web = await containerProvider.createContainer(projectId, 'web', 'ubuntu');
    const db = await containerProvider.createContainer(projectId, 'db', 'ubuntu');
    webId = web.id;
    dbId = db.id;

    const vpcCidr = '10.0.0.0/16';
    const subnetRoutes = (cidr: string) => [
      { destination: cidr, target: 'local' },
      { destination: '0.0.0.0/0', target: 'igw' },
    ];
    config = {
      vpcConfig: { name: 'Main Network', cidr: vpcCidr, dnsEnabled: true, igwEnabled: true },
      subnets: [
        { id: 'subnet-a', name: 'Subnet A', type: 'public', cidr: '10.0.1.0/24', vpcId: 'root-vpc', routes: subnetRoutes(vpcCidr) },
        { id: 'subnet-b', name: 'Subnet B', type: 'public', cidr: '10.0.2.0/24', vpcId: 'root-vpc', routes: subnetRoutes(vpcCidr) },
      ],
      nodeSubnetMap: { [webId]: 'subnet-a', [dbId]: 'subnet-b' },
      nodeSecurityGroups: {
        [webId]: [...DEFAULT_SG],
        // The learner's ALLOW is scoped to the web node (not 0.0.0.0/0): it can
        // only match if the packet reaches db with its source IP preserved.
        [dbId]: [
          { type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: webId },
          ...DEFAULT_SG,
        ],
      },
      nodeIpMap: {},
    };

    await ProjectService.saveNetworkConfig(projectId, config);
    await NetworkService.applyPolicy(projectId, config);
    // The enforcement queue swallows per-plan errors; re-read the applied state below.

    const inspect = await docker.getContainer(dbId).inspect();
    const nets = inspect.NetworkSettings?.Networks || {};
    const subnetNet = Object.keys(nets).find((n) => n.startsWith('akal-subnet-'));
    dbIp = subnetNet ? nets[subnetNet].IPAddress : '';

    // Start listeners on the allowed and on a non-allowed port inside db.
    await containerProvider.executeCustomCommand(dbId, [
      'sh', '-c',
      '( while true; do echo ok | nc -l -p 5432 -q 1; done >/dev/null 2>&1 & ) && ' +
      '( while true; do echo ok | nc -l -p 8080 -q 1; done >/dev/null 2>&1 & ) && echo started',
    ]);
    // Let the policy re-apply storm settle before probing (matches app behavior).
    await new Promise((resolve) => setTimeout(resolve, 2500));
  });

  afterAll(async () => {
    for (const id of [webId, dbId]) {
      if (id) {
        await docker.getContainer(id).remove({ force: true }).catch(() => {});
      }
    }
    if (projectId) {
      await NetworkService.cleanupProjectNetwork(projectId, config).catch(() => {});
      await ProjectService.deleteProject(projectId).catch(() => {});
    }
  });

  it('assigned db an IP on its own subnet network', () => {
    expect(dbIp).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(dbIp.startsWith('10.0.1.')).toBe(false);
  });

  it('records an ok inter-subnet self-test verdict on this host', () => {
    expect(getInterSubnetStatus(projectId)).toBe('ok');
  });

  it('lets real TCP cross subnets on the port allowed by the security group', async () => {
    expect(await canConnect(webId, dbIp, 5432)).toBe(true);
  });

  it('still rejects real TCP on a port the security group does not allow', async () => {
    expect(await canConnect(webId, dbIp, 8080)).toBe(false);
  });

  it('edge_exists passes for the allowed cross-subnet connection', async () => {
    const [result] = await runStepValidators(projectId, {
      id: 'check-edge',
      title: 'integration check',
      instruction: 'n/a',
      validators: [{ type: 'edge_exists', params: { source: 'web', target: 'db', port: 5432 } }],
    });
    expect(result.status).toBe('pass');
  });
});
