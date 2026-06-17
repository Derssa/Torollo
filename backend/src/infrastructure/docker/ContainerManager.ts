import docker from './DockerClient';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  type?: 'ubuntu' | 'postgres';
  port?: string;
}

export class ContainerManager {
  private static LAB_PREFIX = 'akal-lab-';
  private static readonly UBUNTU_IMAGE_TAG = 'derssa/backend-lab-ubuntu:v1';
  private static readonly POSTGRES_IMAGE_TAG = 'postgres:15-alpine';

  /**
   * Ensures that the custom prebuilt Ubuntu image exists locally.
   */
  private static async ensureUbuntuImage(): Promise<void> {
    const images = await docker.listImages();
    const hasImage = images.some(img =>
      img.RepoTags && img.RepoTags.includes(this.UBUNTU_IMAGE_TAG)
    );

    if (!hasImage) {
      console.log('Pulling Ubuntu image (first time only)...');
      await new Promise<void>((resolve, reject) => {
        docker.pull(this.UBUNTU_IMAGE_TAG, {}, (err, stream) => {
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
                console.log(`[Docker Hub Pull] ${event.status}${progress}`);
              }
            }
          );
        });
      });
    }
  }

  /**
   * Ensures that the Postgres image exists locally.
   */
  private static async ensurePostgresImage(): Promise<void> {
    const images = await docker.listImages();
    const hasImage = images.some(img =>
      img.RepoTags && img.RepoTags.includes(this.POSTGRES_IMAGE_TAG)
    );

    if (!hasImage) {
      console.log('Pulling Postgres image (first time only)...');
      await new Promise<void>((resolve, reject) => {
        docker.pull(this.POSTGRES_IMAGE_TAG, {}, (err, stream) => {
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
                console.log(`[Docker Hub Pull - Postgres] ${event.status}${progress}`);
              }
            }
          );
        });
      });
    }
  }

  public static async listContainersByProject(projectId: string): Promise<ContainerInfo[]> {
    const containers = await docker.listContainers({ all: true });
    return containers
      .filter(c => c.Labels && c.Labels['akal.project.id'] === projectId)
      .map(c => {
        let port = '';
        if (c.Ports && c.Ports.length > 0) {
          const matchedPort = c.Ports.find(p => p.PrivatePort === 5432);
          if (matchedPort && matchedPort.PublicPort) {
            port = matchedPort.PublicPort.toString();
          }
        }
        return {
          id: c.Id,
          name: c.Names[0].replace(/^\//, '').replace(`${this.LAB_PREFIX}${projectId}-`, ''),
          image: c.Image,
          state: c.State,
          status: c.Status,
          type: (c.Labels['akal.node.type'] || 'ubuntu') as 'ubuntu' | 'postgres',
          port
        };
      });
  }

  public static async createContainer(projectId: string, nodeName: string, type: string = 'ubuntu'): Promise<ContainerInfo> {
    const isPostgres = type === 'postgres';
    const image = isPostgres ? this.POSTGRES_IMAGE_TAG : this.UBUNTU_IMAGE_TAG;

    if (isPostgres) {
      await this.ensurePostgresImage();
    } else {
      await this.ensureUbuntuImage();
    }
    
    console.log(`Creating ${type} container...`);
    const safeName = `${this.LAB_PREFIX}${projectId}-${nodeName.replace(/[^a-zA-Z0-9-_]/g, '')}`;

    const createOpts: any = {
      Image: image,
      name: safeName,
      Labels: {
        'akal.project.id': projectId,
        'akal.node.type': type
      },
      HostConfig: {
        AutoRemove: false
      }
    };

    if (isPostgres) {
      createOpts.Env = ['POSTGRES_PASSWORD=postgres'];
      createOpts.HostConfig.PortBindings = {
        '5432/tcp': [{ HostPort: '' }] // Docker allocates dynamic host port
      };
    } else {
      createOpts.Cmd = ['/bin/bash'];
      createOpts.Tty = true;
      createOpts.OpenStdin = true;
      createOpts.StdinOnce = false;
    }

    const container = await docker.createContainer(createOpts);

    console.log('Starting container...');
    await container.start();

    let port = '';
    if (isPostgres) {
      const inspectData = await container.inspect();
      const ports = inspectData.NetworkSettings.Ports;
      if (ports && ports['5432/tcp'] && ports['5432/tcp'][0]) {
        port = ports['5432/tcp'][0].HostPort;
      }
    }

    console.log(`${type} node ready`);

    return {
      id: container.id,
      name: nodeName,
      image,
      state: 'running',
      status: 'Up less than a second',
      type: type as 'ubuntu' | 'postgres',
      port
    };
  }

  public static async executePsqlCommand(containerId: string, database: string, sqlQuery: string, extraArgs: string[] = []): Promise<string> {
    const container = docker.getContainer(containerId);
    
    const exec = await container.exec({
      Cmd: ['psql', '-U', 'postgres', '-d', database, ...extraArgs, '-c', sqlQuery],
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

  public static async startContainer(id: string): Promise<void> {
    const container = docker.getContainer(id);
    await container.start();
  }

  public static async stopContainer(id: string): Promise<void> {
    const container = docker.getContainer(id);
    await container.stop();
  }

  public static async deleteContainer(id: string): Promise<void> {
    const container = docker.getContainer(id);
    await container.remove({ force: true });
  }
}
