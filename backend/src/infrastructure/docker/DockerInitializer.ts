import fs from 'fs';
import path from 'path';
import os from 'os';
import docker from './DockerClient';
import { NODE_TYPES, NodeTypeDescriptor } from './nodeTypes';
import { parseProjectsRaw } from '../../modules/projects/services/projectStore';
import {
  hostForwardingResolved,
  imagesPlanned,
  imageReady,
  imageStarted,
  rootlessDetected,
  startupBegan,
  startupFailed,
  startupFinished
} from './startupState';

/**
 * How to rebuild a custom `derssa/*` image locally when it cannot be pulled:
 * its public base plus iptables, committed under the expected tag. The base
 * image's entrypoint is restored explicitly because the build container runs
 * with a `tail -f` entrypoint.
 */
interface LocalBuildSpec {
  baseTag: string;
  buildContainerName: string;
  installCommand: string;
  repo: string;
  tag: string;
  cmd: string;
}

const LOCAL_BUILDS: Record<string, LocalBuildSpec> = {
  [NODE_TYPES.mongo.image]: {
    baseTag: 'mongo:latest',
    buildContainerName: 'akal-lab-temp-mongo-build',
    installCommand: 'apt-get update && apt-get install -y iptables iproute2 && apt-get clean && rm -rf /var/lib/apt/lists/*',
    repo: 'derssa/backend-lab-mongo',
    tag: 'v1',
    cmd: 'mongod'
  },
  [NODE_TYPES.redis.image]: {
    baseTag: 'redis:7-alpine',
    buildContainerName: 'akal-lab-temp-redis-build',
    installCommand: 'apk update && apk add --no-cache iptables iproute2',
    repo: 'derssa/backend-lab-redis',
    tag: 'v1',
    cmd: 'redis-server'
  },
  [NODE_TYPES.rabbitmq.image]: {
    baseTag: 'rabbitmq:3-management-alpine',
    buildContainerName: 'akal-lab-temp-rabbitmq-build',
    installCommand: 'apk update && apk add --no-cache iptables iproute2',
    repo: 'derssa/backend-lab-rabbitmq',
    tag: 'v1',
    cmd: 'rabbitmq-server'
  }
};

/** Images downloaded at startup so the first node does not wait for a pull. */
const PRELOADED_NODE_TYPES: NodeTypeDescriptor[] = [
  NODE_TYPES.ubuntu,
  NODE_TYPES.postgres,
  NODE_TYPES.mongo,
  NODE_TYPES.redis,
  NODE_TYPES.rabbitmq
];

const HOST_FORWARDING_CONTAINER = 'akal-lab-host-forwarding';

export class DockerInitializer {
  private static isInitializing = false;

  /**
   * Initializes Docker dependencies asynchronously in the background. Progress
   * is published through startupState (see GET /health).
   */
  public static initialize(): void {
    if (this.isInitializing) return;
    this.isInitializing = true;
    startupBegan();

    this.checkAndPullImages()
      .then(() => startupFinished())
      .catch(err => {
        console.error('[DockerInitializer] Error during initialization:', err);
        startupFailed(err);
      })
      .finally(() => {
        this.isInitializing = false;
      });
  }

  /**
   * Ensures a single node image is available locally, applying the same
   * pull-then-build fallback as startup: the custom `derssa/*` images may not
   * be published to a registry, so when the pull fails they are rebuilt from
   * their public base + iptables. Lets callers (e.g. integration tests) get one
   * image ready without running the full startup routine.
   */
  public static async ensureImageAvailable(tag: string): Promise<void> {
    const images = await docker.listImages();
    const existingTags = images.flatMap(img => img.RepoTags || []);
    await this.ensureImage(existingTags, tag, tag);
  }

  /**
   * Names of subnet networks referenced by current projects, or null when
   * projects.json exists but cannot be parsed. A missing file means no
   * projects, so every subnet network is a genuine orphan.
   */
  private static readActiveSubnetNetworkNames(): Set<string> | null {
    const dbPath = path.join(os.homedir(), '.torollo', 'projects.json');
    const names = new Set<string>();
    if (!fs.existsSync(dbPath)) return names;
    let projects;
    try {
      projects = parseProjectsRaw(fs.readFileSync(dbPath, 'utf-8'));
    } catch (err) {
      console.error('[DockerInitializer] Failed to read projects.json for orphaned network cleanup:', err);
      return null;
    }
    if (projects === null) {
      console.error('[DockerInitializer] Failed to parse projects.json for orphaned network cleanup');
      return null;
    }
    for (const p of projects) {
      for (const s of p.networkConfig?.subnets || []) {
        names.add(`akal-subnet-${p.id}-${s.id}`);
      }
    }
    return names;
  }

  private static async ensureSharedNetwork(): Promise<void> {
    try {
      const networks = await docker.listNetworks();

      // Clean up orphaned subnet networks (from deleted/wiped projects) on
      // startup. When project metadata is unreadable, skip the cleanup rather
      // than treating every subnet network as orphaned and deleting them all.
      const activeSubnetNetNames = this.readActiveSubnetNetworkNames();
      if (activeSubnetNetNames) {
        for (const net of networks) {
          if (net.Name.startsWith('akal-subnet-') && !activeSubnetNetNames.has(net.Name)) {
            console.log(`[DockerInitializer] Cleaning up orphaned subnet network: ${net.Name}`);
            try {
              const network = docker.getNetwork(net.Id);
              const netInspect = await network.inspect();
              const connectedContainers = Object.keys(netInspect.Containers || {});
              for (const cId of connectedContainers) {
                await network.disconnect({ Container: cId, Force: true });
              }
              await network.remove();
            } catch (err) {
              console.error(`Failed to clean up orphaned network ${net.Name}:`, err);
            }
          }
        }
      }

      const hasNetwork = networks.some(n => n.Name === 'akal-lab-network');
      if (!hasNetwork) {
        console.log('Creating global shared network: akal-lab-network...');
        await docker.createNetwork({
          Name: 'akal-lab-network',
          Driver: 'bridge'
        });
      } else {
        console.log('Global shared network akal-lab-network ready');
      }
    } catch (err) {
      console.error('[DockerInitializer] Failed to check/create global network:', err);
    }
  }

  /**
   * Rootless Docker runs the daemon in a user namespace: a privileged
   * host-network container lands in that namespace, not on the host, and
   * cannot edit its netfilter tables. Detected once so the host forwarding
   * step can say "unsupported" instead of failing for no visible reason.
   */
  private static async detectRootless(): Promise<boolean> {
    const info = await docker.info();
    const securityOptions: unknown = info?.SecurityOptions;
    const rootless = Array.isArray(securityOptions) && securityOptions.includes('name=rootless');
    rootlessDetected(rootless);
    return rootless;
  }

  /**
   * Applies the host-level rules cross-subnet traffic depends on: an ACCEPT
   * on FORWARD, and a NAT bypass between private ranges so containers see
   * each other's real source IPs. Runs a throwaway privileged container in
   * the host network namespace and reports its exit code — a failure here
   * silently breaks subnets, NAT and security groups, so it must be visible.
   */
  private static async ensureHostForwarding(rootless: boolean): Promise<void> {
    if (rootless) {
      console.warn('[DockerInitializer] Rootless Docker detected: host forwarding rules cannot be applied. Containers work; subnets, NAT and cross-subnet security groups will not.');
      hostForwardingResolved('unsupported');
      return;
    }

    console.log('[DockerInitializer] Configuring Docker host to allow forwarding and preserve source IPs...');
    let temp: Awaited<ReturnType<typeof docker.createContainer>> | null = null;
    try {
      await this.removeContainerIfExists(HOST_FORWARDING_CONTAINER);
      temp = await docker.createContainer({
        Image: 'alpine',
        name: HOST_FORWARDING_CONTAINER,
        HostConfig: {
          Privileged: true,
          NetworkMode: 'host'
        },
        Cmd: [
          'sh',
          '-c',
          'apk add --no-cache iptables && ' +
          'iptables -C FORWARD -j ACCEPT 2>/dev/null || iptables -I FORWARD -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -d 10.0.0.0/8 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 10.0.0.0/8 -d 10.0.0.0/8 -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 172.16.0.0/12 -d 172.16.0.0/12 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 172.16.0.0/12 -d 172.16.0.0/12 -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 192.168.0.0/16 -d 192.168.0.0/16 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 192.168.0.0/16 -d 192.168.0.0/16 -j ACCEPT'
        ]
      });
      await temp.start();
      const { StatusCode } = await temp.wait();
      if (StatusCode !== 0) {
        throw new Error(`host forwarding container exited with status ${StatusCode}`);
      }
      console.log('[DockerInitializer] Host forwarding and NAT bypass rules applied successfully.');
      hostForwardingResolved('applied');
    } catch (err) {
      console.error('[DockerInitializer] Failed to configure host forwarding/NAT bypass:', err);
      hostForwardingResolved('failed');
    } finally {
      if (temp) {
        await temp.remove({ force: true }).catch(() => undefined);
      }
    }
  }

  private static async checkAndPullImages(): Promise<void> {
    try {
      await this.ensureSharedNetwork();
      const rootless = await this.detectRootless();
      await this.ensureHostForwarding(rootless);
      const images = await docker.listImages();
      const tags = images.flatMap(img => img.RepoTags || []);

      imagesPlanned(PRELOADED_NODE_TYPES.length);
      for (const nodeType of PRELOADED_NODE_TYPES) {
        await this.ensureImage(tags, nodeType.image, nodeType.label);
        imageReady();
      }
    } catch (err) {
      console.error('[DockerInitializer] Docker check failed. Is Docker running?');
      throw err;
    }
  }

  private static async ensureImage(existingTags: string[], tag: string, label: string): Promise<void> {
    console.log(`Checking ${label} image...`);
    imageStarted(label, 'checking');
    if (existingTags.includes(tag)) {
      console.log(`${label} image ready`);
      return;
    }

    console.log(`Pulling ${label} image (first run only)...`);
    imageStarted(label, 'pulling');
    try {
      await this.pullImage(tag);
      console.log(`${label} image ready`);
      return;
    } catch (pullErr) {
      console.warn(`[DockerInitializer] Failed to pull ${tag} (${pullErr}). Trying fallback...`);
      const fallback = NODE_TYPES.postgres.fallbackImage;
      if (tag === NODE_TYPES.postgres.image && fallback) {
        if (!existingTags.includes(fallback.sourceTag)) throw pullErr;
        console.log(`[DockerInitializer] Tagging local ${fallback.sourceTag} as ${tag}...`);
        await docker.getImage(fallback.sourceTag).tag({ repo: fallback.repo, tag: fallback.tag });
        console.log(`[DockerInitializer] Tagged ${fallback.sourceTag} as ${tag} successfully.`);
        return;
      }
      const build = LOCAL_BUILDS[tag];
      if (!build) throw pullErr;
      imageStarted(label, 'building');
      await this.buildImageWithIptables(tag, build);
    }
  }

  private static pullImage(tag: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      docker.pull(tag, {}, (err, stream) => {
        if (err) return reject(err);
        if (!stream) return reject(new Error('Pull stream is undefined'));
        docker.modem.followProgress(
          stream,
          (errFinished) => (errFinished ? reject(errFinished) : resolve()),
          (event) => {
            // Layer-level byte counters would flood the log; keep the milestones.
            if (event.status && !event.progress) {
              console.log(`[Docker Hub Pull - ${tag}] ${event.status}`);
            }
          }
        );
      });
    });
  }

  private static async removeContainerIfExists(name: string): Promise<void> {
    try {
      await docker.getContainer(name).remove({ force: true });
    } catch {
      // Nothing left over from a previous run.
    }
  }

  /**
   * Pulls the public base, installs iptables in a throwaway container and
   * commits the result as `tag`. Same steps for every custom image.
   */
  private static async buildImageWithIptables(tag: string, build: LocalBuildSpec): Promise<void> {
    console.log(`[DockerInitializer] Tag ${tag} not found. Building it locally from ${build.baseTag}...`);

    const imagesList = await docker.listImages();
    const localTags = imagesList.flatMap(img => img.RepoTags || []);
    if (!localTags.includes(build.baseTag)) {
      console.log(`[DockerInitializer] Pulling base ${build.baseTag} image...`);
      await this.pullImage(build.baseTag);
    }

    await this.removeContainerIfExists(build.buildContainerName);

    console.log(`[DockerInitializer] Creating temporary build container ${build.buildContainerName}...`);
    const tempContainer = await docker.createContainer({
      Image: build.baseTag,
      name: build.buildContainerName,
      Entrypoint: ['tail', '-f', '/dev/null']
    });
    try {
      await tempContainer.start();

      console.log('[DockerInitializer] Installing iptables inside build container...');
      const exec = await tempContainer.exec({
        Cmd: ['sh', '-c', build.installCommand],
        AttachStdout: true,
        AttachStderr: true
      });
      const stream = await exec.start({});
      await new Promise<void>((resolve) => {
        stream.on('data', () => {});
        stream.on('end', () => resolve());
      });
      const { ExitCode } = await exec.inspect();
      if (ExitCode !== 0) {
        throw new Error(`installing iptables in ${build.baseTag} exited with status ${ExitCode}`);
      }

      console.log(`[DockerInitializer] Committing custom image as ${tag}...`);
      await tempContainer.commit({
        repo: build.repo,
        tag: build.tag,
        changes: [
          'ENTRYPOINT ["docker-entrypoint.sh"]',
          `CMD ["${build.cmd}"]`
        ]
      });
      console.log(`[DockerInitializer] Custom image ${tag} with iptables created successfully.`);
    } finally {
      console.log('[DockerInitializer] Cleaning up temporary build container...');
      await tempContainer.remove({ force: true }).catch(() => undefined);
    }
  }
}
