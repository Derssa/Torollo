import docker from '../../../infrastructure/docker/DockerClient';
import { containerProvider } from '../../../infrastructure/docker/providers/dockerContainerProvider';
import { ProjectService } from '../../projects/services/projectService';
import { RoadmapStep } from '../format/roadmapTypes';
import { runStepValidators } from './engine';
import { ValidatorResult } from './types';

/**
 * Integration tests (run with `npm run test:integration`, requires a Docker daemon).
 *
 * The unit tests next to each validator mock every Docker/DB call — they prove the
 * logic, not the contact with reality. This suite runs all 8 validators, pass and
 * fail, through `runStepValidators` with its *default* dependencies (the real
 * `containerProvider`/`ProjectService`/`NetworkService` singletons) against one
 * disposable project with real containers.
 *
 * `edge_exists`/`port_denied`/`lb_upstreams` never touch iptables or attempt a live
 * connection (see the comment in `validators/portDenied.ts`) — they only read the
 * project's persisted network config, so no `NetworkService.applyPolicy` call is
 * needed here, only `ProjectService.saveNetworkConfig`.
 *
 * To keep the suite non-flaky, every pass/fail pair reads the *same* static fixture
 * with different params — nothing is mutated between assertions.
 */

/**
 * `containerProvider.createContainer` attaches every container to this network
 * (`HostConfig.NetworkMode: 'akal-lab-network'`). In the running app it's created
 * once at server startup (`DockerInitializer.ensureSharedNetwork`), but this suite
 * never boots the server, so a fresh Docker daemon (e.g. a CI runner) won't have it.
 */
async function ensureSharedNetwork(): Promise<void> {
  const networks = await docker.listNetworks();
  if (!networks.some((n) => n.Name === 'akal-lab-network')) {
    await docker.createNetwork({ Name: 'akal-lab-network', Driver: 'bridge' });
  }
}

async function waitUntilReady(check: () => Promise<string>, label: string): Promise<void> {
  const deadline = Date.now() + 60000;
  let lastOutput = '';
  while (Date.now() < deadline) {
    lastOutput = await check();
    if (!lastOutput.startsWith('ERROR')) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not become ready in time (last output: ${lastOutput})`);
}

describe('learning engine — real containers (V-4)', () => {
  let projectId = '';
  let stepCounter = 0;

  async function runOne(type: string, params: Record<string, unknown>): Promise<ValidatorResult> {
    const step: RoadmapStep = {
      id: `check-${stepCounter++}`,
      title: 'integration check',
      instruction: 'n/a',
      validators: [{ type, params }],
    };
    const [result] = await runStepValidators(projectId, step);
    return result;
  }

  beforeAll(async () => {
    try {
      await docker.ping();
    } catch {
      throw new Error(
        'Docker daemon is not reachable. Integration tests require a running Docker daemon.'
      );
    }

    await ensureSharedNetwork();

    const project = await ProjectService.createProject('v4-integration-fixture');
    projectId = project.id;

    const web = await containerProvider.createContainer(projectId, 'web', 'ubuntu');
    const stoppedWeb = await containerProvider.createContainer(projectId, 'stopped-web', 'ubuntu');
    await containerProvider.stopContainer(stoppedWeb.id);
    const db = await containerProvider.createContainer(projectId, 'db', 'postgres');
    const cache = await containerProvider.createContainer(projectId, 'cache', 'redis');
    const nosql = await containerProvider.createContainer(projectId, 'nosql', 'mongo');
    const lb = await containerProvider.createContainer(projectId, 'lb', 'loadbalancer');
    const asgBoundary = await containerProvider.createContainer(projectId, 'web-asg', 'ubuntu');
    await containerProvider.createContainer(projectId, 'web-asg-replica-1', 'ubuntu', false, undefined, {
      'akal.asg.id': asgBoundary.id,
      'akal.asg.instance': 'true',
    });
    await containerProvider.createContainer(projectId, 'web-asg-replica-2', 'ubuntu', false, undefined, {
      'akal.asg.id': asgBoundary.id,
      'akal.asg.instance': 'true',
    });

    await waitUntilReady(
      () => containerProvider.executePsqlCommand(db.id, 'postgres', 'SELECT 1;'),
      'PostgreSQL'
    );
    await waitUntilReady(() => containerProvider.executeRedisCommand(cache.id, ['PING']), 'Redis');
    await waitUntilReady(
      () => containerProvider.executeMongoCommand(nosql.id, 'db.runCommand({ ping: 1 })'),
      'MongoDB'
    );

    await containerProvider.executePsqlCommand(db.id, 'postgres', 'CREATE TABLE users (id serial primary key);');
    await containerProvider.executeRedisCommand(cache.id, ['SET', 'session:abc123', 'value']);
    await containerProvider.executeMongoCommand(
      nosql.id,
      "db.getSiblingDB('test').events.insertOne({ seed: true })"
    );

    await ProjectService.saveNetworkConfig(projectId, {
      nodeSubnetMap: {
        [web.id]: 'public',
        [db.id]: 'private',
        [cache.id]: 'private',
        [nosql.id]: 'private',
      },
      nodeSecurityGroups: {
        [web.id]: [
          { id: 'sg-web-to-db', type: 'outbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: db.id },
        ],
      },
      loadBalancerTargets: {
        [lb.id]: [asgBoundary.id],
      },
      asgs: {
        [asgBoundary.id]: { parentId: asgBoundary.id },
      },
    });
  });

  afterAll(async () => {
    if (!projectId) return;
    await ProjectService.deleteProject(projectId);
  });

  it('container_running passes against a running container', async () => {
    const result = await runOne('container_running', { node: 'web' });
    expect(result.status).toBe('pass');
  });

  it('container_running fails against a stopped container', async () => {
    const result = await runOne('container_running', { node: 'stopped-web' });
    expect(result.status).toBe('fail');
    expect(result.expected).toBeTruthy();
    expect(result.observed).toBeTruthy();
  });

  it('table_exists passes against a real table', async () => {
    const result = await runOne('table_exists', { node: 'db', table: 'users' });
    expect(result.status).toBe('pass');
  });

  it('table_exists fails against a table that was never created', async () => {
    const result = await runOne('table_exists', { node: 'db', table: 'ghost_table' });
    expect(result.status).toBe('fail');
    expect(result.expected).toBeTruthy();
    expect(result.observed).toBeTruthy();
  });

  it('redis_key_exists passes against a real key', async () => {
    const result = await runOne('redis_key_exists', { node: 'cache', key: 'session:*' });
    expect(result.status).toBe('pass');
  });

  it('redis_key_exists fails against a key that was never set', async () => {
    const result = await runOne('redis_key_exists', { node: 'cache', key: 'nope:*' });
    expect(result.status).toBe('fail');
    expect(result.expected).toBeTruthy();
    expect(result.observed).toBeTruthy();
  });

  it('mongo_collection_exists passes against a real collection', async () => {
    const result = await runOne('mongo_collection_exists', { node: 'nosql', collection: 'events' });
    expect(result.status).toBe('pass');
  });

  it('mongo_collection_exists fails against a collection that was never created', async () => {
    const result = await runOne('mongo_collection_exists', { node: 'nosql', collection: 'ghost' });
    expect(result.status).toBe('fail');
    expect(result.expected).toBeTruthy();
    expect(result.observed).toBeTruthy();
  });

  it('edge_exists passes for an allowed source/target/port', async () => {
    const result = await runOne('edge_exists', { source: 'web', target: 'db', port: 5432 });
    expect(result.status).toBe('pass');
  });

  it('edge_exists fails for a pair with no security group rule', async () => {
    const result = await runOne('edge_exists', { source: 'web', target: 'nosql', port: 5432 });
    expect(result.status).toBe('fail');
    expect(result.expected).toBeTruthy();
    expect(result.observed).toBeTruthy();
  });

  it('port_denied passes for a port with no allow rule', async () => {
    const result = await runOne('port_denied', { source: 'web', target: 'db', port: 9999 });
    expect(result.status).toBe('pass');
  });

  it('port_denied fails for a port that is explicitly allowed', async () => {
    const result = await runOne('port_denied', { source: 'web', target: 'db', port: 5432 });
    expect(result.status).toBe('fail');
    expect(result.expected).toBeTruthy();
    expect(result.observed).toBeTruthy();
  });

  it('lb_upstreams passes when enough replicas are running', async () => {
    const result = await runOne('lb_upstreams', { node: 'lb', min: 2 });
    expect(result.status).toBe('pass');
  });

  it('lb_upstreams fails when fewer replicas are running than required', async () => {
    const result = await runOne('lb_upstreams', { node: 'lb', min: 5 });
    expect(result.status).toBe('fail');
    expect(result.expected).toBeTruthy();
    expect(result.observed).toBeTruthy();
  });

  it('asg_replicas passes when the replica count matches', async () => {
    const result = await runOne('asg_replicas', { node: 'web-asg', count: 2 });
    expect(result.status).toBe('pass');
  });

  it('asg_replicas fails when the replica count does not match', async () => {
    const result = await runOne('asg_replicas', { node: 'web-asg', count: 5 });
    expect(result.status).toBe('fail');
    expect(result.expected).toBeTruthy();
    expect(result.observed).toBeTruthy();
  });
});
