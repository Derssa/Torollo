import docker from './DockerClient';
import { NODE_TYPES } from './nodeTypes';
import { DockerInitializer } from './DockerInitializer';

/**
 * Integration tests (run with `npm run test:integration`, requires a Docker daemon).
 *
 * The backend enforces Security Groups and routing by exec-ing `iptables` and
 * `ip route` inside every lab container (see dockerNetworkProvider.applyPlan).
 * These tests verify that every image declared in the NODE_TYPES registry ships
 * both tools and that iptables actually works under CAP_NET_ADMIN — the exact
 * conditions lab containers run with (dockerContainerProvider adds NET_ADMIN,
 * never full privileges).
 */

const images = [...new Set(Object.values(NODE_TYPES).map(t => t.image))];

async function runInImage(image: string, cmd: string): Promise<{ exitCode: number; output: string }> {
  const container = await docker.createContainer({
    Image: image,
    // Override the entrypoint so database images run our check instead of their server.
    Entrypoint: ['sh', '-c', cmd],
    // Tty merges stdout/stderr as plain text, so failure logs are readable as-is.
    Tty: true,
    HostConfig: { CapAdd: ['NET_ADMIN'] }
  });
  try {
    await container.start();
    const { StatusCode } = await container.wait();
    const logs = await container.logs({ stdout: true, stderr: true });
    return { exitCode: StatusCode, output: logs.toString().trim() };
  } finally {
    await container.remove({ force: true }).catch(() => {});
  }
}

describe('node image requirements', () => {
  beforeAll(async () => {
    try {
      await docker.ping();
    } catch {
      throw new Error(
        'Docker daemon is not reachable. Integration tests require a running Docker daemon.'
      );
    }
  });

  it.each(images)(
    '%s ships iptables and iproute2, and iptables works under CAP_NET_ADMIN',
    async (image) => {
      // Build the custom `derssa/*` images locally when they are not published
      // to a registry (same pull-then-build fallback the backend runs at startup).
      await DockerInitializer.ensureImageAvailable(image);
      const result = await runInImage(image, 'command -v iptables && command -v ip && iptables -S');
      expect(result).toMatchObject({ exitCode: 0 });
    }
  );
});
