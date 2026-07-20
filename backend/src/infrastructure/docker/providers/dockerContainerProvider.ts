import docker from '../DockerClient';
import { ContainerNotFoundError } from '../dockerErrors';
import { NodeType, NodeTypeDescriptor, resolveNodeType } from '../nodeTypes';
import { InvalidImageReferenceError, isValidImageReference } from '../imageReference';
import { ContainerInfo, ContainerProvider } from './containerProvider';

export class DockerContainerProvider implements ContainerProvider {
  private readonly LAB_PREFIX = 'akal-lab-';
  private crashedInstances = new Set<string>();

  public markAsCrashed(instanceId: string): void {
    this.crashedInstances.add(instanceId);
    this.crashedInstances.add(instanceId.slice(0, 12));
  }

  public clearCrashed(instanceId: string): void {
    this.crashedInstances.delete(instanceId);
    this.crashedInstances.delete(instanceId.slice(0, 12));
  }

  public clearAllCrashed(): void {
    this.crashedInstances.clear();
  }

  public isCrashed(instanceId: string): boolean {
    return this.crashedInstances.has(instanceId) || this.crashedInstances.has(instanceId.slice(0, 12));
  }

  private async pullImage(tag: string, label: string): Promise<void> {
    console.log(`Pulling ${label} image (first time only)...`);
    await new Promise<void>((resolve, reject) => {
      docker.pull(tag, {}, (err, stream) => {
        if (err) return reject(err);
        if (!stream) return reject(new Error('Pull stream is undefined'));

        docker.modem.followProgress(
          stream,
          (errFinished) => {
            if (errFinished) return reject(errFinished);
            resolve();
          },
          (event) => {
            if (event.status) {
              const progress = event.progress ? ` ${event.progress}` : '';
              console.log(`[Docker Hub Pull - ${label}] ${event.status}${progress}`);
            }
          }
        );
      });
    });
  }

  /**
   * Ensures the node type's image exists locally, pulling it if needed. If the
   * pull fails and the descriptor declares a fallback that exists locally, the
   * fallback is retagged as the expected image.
   */
  private async ensureImage(desc: NodeTypeDescriptor): Promise<void> {
    const images = await docker.listImages();
    const tags = images.flatMap(img => img.RepoTags || []);
    if (tags.includes(desc.image)) return;

    try {
      await this.pullImage(desc.image, desc.label);
    } catch (pullErr) {
      const fallback = desc.fallbackImage;
      if (fallback && tags.includes(fallback.sourceTag)) {
        console.warn(`[DockerContainerProvider] Failed to pull ${desc.image}. Trying fallback...`);
        console.log(`[DockerContainerProvider] Tagging local ${fallback.sourceTag} as ${desc.image}...`);
        await docker.getImage(fallback.sourceTag).tag({ repo: fallback.repo, tag: fallback.tag });
      } else {
        throw pullErr;
      }
    }
  }

  /**
   * Verifies that `containerId` (id or name) carries the label
   * `akal.project.id === projectId`. Throws ContainerNotFoundError otherwise —
   * including when the container simply does not exist, so callers cannot
   * distinguish "not yours" from "not there".
   */
  public async assertContainerInProject(containerId: string, projectId: string): Promise<void> {
    let labels: Record<string, string> | undefined;
    try {
      const info = await docker.getContainer(containerId).inspect();
      labels = info.Config?.Labels;
    } catch (err: any) {
      if (err?.statusCode === 404) {
        throw new ContainerNotFoundError(containerId);
      }
      throw err;
    }
    if (!projectId || labels?.['akal.project.id'] !== projectId) {
      throw new ContainerNotFoundError(containerId);
    }
  }

  public async listContainersByProject(projectId: string): Promise<ContainerInfo[]> {
    const containers = await docker.listContainers({ all: true });
    return containers
      .filter(c => c.Labels && c.Labels['akal.project.id'] === projectId)
      .map(c => {
        let port = '';
        const privatePort = resolveNodeType(c.Labels['akal.node.type']).defaultPrivatePort;
        if (privatePort && c.Ports && c.Ports.length > 0) {
          const matchedPort = c.Ports.find(p => p.PrivatePort === privatePort);
          if (matchedPort && matchedPort.PublicPort) {
            port = matchedPort.PublicPort.toString();
          }
        }
        let ip = '';
        const networks = c.NetworkSettings?.Networks;
        if (networks) {
          let key = Object.keys(networks).find(k => k.startsWith('akal-subnet-'));
          if (!key) {
            key = Object.keys(networks).find(k => k.startsWith('akal-'));
          }
          if (key && networks[key]) {
            const tempIp = networks[key].IPAddress;
            if (tempIp && !tempIp.startsWith('172.')) {
              ip = tempIp;
            }
          }
        }
        const asgId = c.Labels['akal.asg.id'];
        const isAsgInstance = c.Labels['akal.asg.instance'] === 'true';
        const isFakeCrashed = this.isCrashed(c.Id);
        return {
          id: c.Id,
          name: c.Names[0].replace(/^\//, '').replace(`${this.LAB_PREFIX}${projectId}-`, ''),
          image: c.Image,
          state: isFakeCrashed ? 'exited' : c.State,
          status: isFakeCrashed ? 'Exited (0) 1 second ago' : c.Status,
          type: (c.Labels['akal.node.type'] || 'ubuntu') as NodeType,
          port,
          ip,
          asgId,
          isAsgInstance
        };
      });
  }

  public async createContainer(
    projectId: string,
    nodeName: string,
    type: string = 'ubuntu',
    isPublic: boolean = false,
    customImage?: string,
    extraLabels?: Record<string, string>
  ): Promise<ContainerInfo> {
    const desc = resolveNodeType(type);
    if (customImage !== undefined && !isValidImageReference(customImage)) {
      throw new InvalidImageReferenceError(customImage);
    }
    const image = customImage ?? desc.image;

    if (customImage) {
      console.log(`[DockerContainerProvider] Using custom image: ${customImage}`);
    } else {
      await this.ensureImage(desc);
    }

    console.log(`Creating ${type} container...`);
    const safeName = `${this.LAB_PREFIX}${projectId}-${nodeName.replace(/[^a-zA-Z0-9-_]/g, '')}`;

    try {
      const existingConflict = docker.getContainer(safeName);
      await existingConflict.remove({ force: true });
      console.log(`[DockerContainerProvider] Force-removed conflicting container with name: ${safeName}`);
    } catch {
      // Ignore if container conflict does not exist
    }

    const publishPublicPort = desc.publicPort === 'always' || (desc.publicPort === 'whenPublic' && isPublic);
    const portKey = `${desc.defaultPrivatePort ?? 80}/tcp`;

    const createOpts: any = {
      Image: image,
      name: safeName,
      Labels: {
        'akal.project.id': projectId,
        'akal.node.type': type,
        ...(extraLabels || {})
      },
      ...(desc.env ? { Env: desc.env } : {}),
      ...(desc.entrypoint ? { Entrypoint: desc.entrypoint } : {}),
      ...(desc.cmd ? { Cmd: desc.cmd } : {}),
      ...(desc.interactiveTty ? { Tty: true, OpenStdin: true, StdinOnce: false } : {}),
      HostConfig: {
        AutoRemove: false,
        NetworkMode: 'akal-lab-network',
        CapAdd: ['NET_ADMIN'],
        ...(desc.hostConfigExtras || {}),
        ...(publishPublicPort ? { PortBindings: { [portKey]: [{ HostPort: '' }] } } : {})
      },
      NetworkingConfig: {
        EndpointsConfig: {
          'akal-lab-network': {
            Aliases: [nodeName]
          }
        }
      }
    };

    const container = await docker.createContainer(createOpts);

    console.log('Starting container...');
    await container.start();

    let port = '';
    const inspectData = await container.inspect();
    if (publishPublicPort) {
      const ports = inspectData.NetworkSettings.Ports;
      const targetPortKey = portKey;
      if (ports && ports[targetPortKey] && ports[targetPortKey][0]) {
        port = ports[targetPortKey][0].HostPort;
      }
    }

    let ip = '';
    const networks = inspectData.NetworkSettings.Networks;
    if (networks) {
      const key = Object.keys(networks).find(k => k.startsWith('akal-'));
      if (key && networks[key]) {
        ip = networks[key].IPAddress;
      }
    }

    console.log(`${type} node ready`);

    return {
      id: container.id,
      name: nodeName,
      image,
      state: 'running',
      status: 'Up less than a second',
      type: type as NodeType,
      port,
      ip
    };
  }

  public async renameContainer(
    containerId: string,
    projectId: string,
    newName: string
  ): Promise<void> {
    const container = docker.getContainer(containerId);
    const safeName = `${this.LAB_PREFIX}${projectId}-${newName.replace(/[^a-zA-Z0-9-_]/g, '')}`;
    const safeAlias = newName.trim().replace(/[^a-zA-Z0-9-_]/g, '');

    try {
      const containerInfo = await container.inspect();
      const currentName = containerInfo.Name.replace(/^\//, '');
      if (currentName.toLowerCase() === safeName.toLowerCase()) {
        return;
      }
    } catch (inspectErr) {
      console.warn(`Failed to inspect container ${containerId} during rename check:`, inspectErr);
    }

    // Rename the Docker container itself
    await container.rename({ name: safeName });

    // Update the network alias so that inter-container DNS resolves to the new
    // name. Docker does not support mutating aliases on a live connection, so we
    // disconnect and reconnect — this is safe because rename is only allowed on
    // stopped containers.
    const network = docker.getNetwork('akal-lab-network');
    try {
      await network.disconnect({ Container: containerId });
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('not connected to the network') || msg.includes('is not connected')) {
        console.log(`[DockerContainerProvider] Container ${containerId} is not connected to network akal-lab-network, skipping disconnect.`);
      } else {
        throw err;
      }
    }

    try {
      await network.connect({
        Container: containerId,
        EndpointConfig: { Aliases: [safeAlias || safeName] }
      });
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('already connected') || msg.includes('already exists')) {
        console.log(`[DockerContainerProvider] Container ${containerId} already connected to network, ignoring error.`);
      } else {
        console.warn(`[DockerContainerProvider] Failed to reconnect container ${containerId} with alias ${safeAlias || safeName}; retrying without aliases.`, err);
        try {
          await network.connect({
            Container: containerId
          });
        } catch (fallbackErr: any) {
          const fallbackMsg = fallbackErr.message || '';
          if (fallbackMsg.includes('already connected') || fallbackMsg.includes('already exists')) {
            console.log(`[DockerContainerProvider] Container ${containerId} already connected to network, ignoring fallback error.`);
          } else {
            throw fallbackErr;
          }
        }
      }
    }
  }

  /** Runs a command inside a container and captures its combined stdout/stderr. */
  private async execCapture(containerId: string, cmd: string[]): Promise<string> {
    const container = docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await exec.start({});

    return new Promise<string>((resolve, reject) => {
      let output = '';

      container.modem.demuxStream(stream, {
        write: (chunk: Buffer) => {
          output += chunk.toString();
        }
      }, {
        write: (chunk: Buffer) => {
          output += chunk.toString();
        }
      });

      stream.on('end', () => {
        resolve(output.trim());
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  public async executePsqlCommand(containerId: string, database: string, sqlQuery: string, extraArgs: string[] = []): Promise<string> {
    const output = await this.execCapture(containerId, ['psql', '-U', 'postgres', '-d', database, ...extraArgs, '-c', sqlQuery]);
    if (output.includes('connection to server on socket') || output.includes('Is the server running locally')) {
      return 'ERROR: Database server is still starting up. Please wait 5-10 seconds for initialization to complete and try again.';
    }
    return output;
  }

  public async executeRedisCommand(containerId: string, args: string[]): Promise<string> {
    const output = await this.execCapture(containerId, ['redis-cli', ...args]);
    if (output.includes('Could not connect to Redis') || output.includes('Connection refused')) {
      return 'ERROR: Redis server is still starting up. Please wait 5-10 seconds for initialization to complete and try again.';
    }
    return output;
  }

  public async executeMongoCommand(containerId: string, evalExpression: string): Promise<string> {
    const output = await this.execCapture(containerId, ['mongosh', '--quiet', '--eval', evalExpression]);
    if (
      output.includes('MongoNetworkError') ||
      output.includes('connect failed') ||
      output.includes('ECONNREFUSED')
    ) {
      return 'ERROR: Database server is still starting up. Please wait 5-10 seconds for initialization to complete and try again.';
    }
    return output;
  }

  public async executeCustomCommand(containerId: string, cmd: string[]): Promise<string> {
    return this.execCapture(containerId, cmd);
  }

  public async commitContainer(id: string, repoName: string, tag: string = 'latest'): Promise<string> {
    try {
      const container = docker.getContainer(id);
      const result: any = await container.commit({
        repo: repoName,
        tag: tag
      });
      console.log(`[DockerContainerProvider] Committed container ${id.slice(0, 12)} as image ${repoName}:${tag}`);
      return result.Id || '';
    } catch (err) {
      console.error(`[DockerContainerProvider] Failed to commit container ${id}:`, err);
      throw err;
    }
  }

  public async startContainer(id: string): Promise<void> {
    const container = docker.getContainer(id);
    await container.start();
  }

  public async stopContainer(id: string): Promise<void> {
    const container = docker.getContainer(id);
    await container.stop();
  }

  public async deleteContainer(id: string): Promise<void> {
    const container = docker.getContainer(id);
    await container.remove({ force: true });
  }

  public async scaleContainer(id: string, cpus?: number, memory?: number): Promise<void> {
    try {
      console.log(`[DockerContainerProvider] [SIMULATED] Scaled container ${id.slice(0, 12)} to CPU: ${cpus}, MEM: ${memory}MB`);
    } catch (err) {
      console.error(`[DockerContainerProvider] Failed to scale container ${id}:`, err);
      throw err;
    }
  }
}

/**
 * Shared singleton: crash-simulation state must be visible to every consumer
 * (asgService marks instances crashed, other services list them).
 */
export const containerProvider: ContainerProvider = new DockerContainerProvider();
