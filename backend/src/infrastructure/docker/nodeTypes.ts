/**
 * Declarative registry of lab node types. Adding a new node type only requires
 * adding an entry here (plus, if it must be preloaded at startup, a call in
 * DockerInitializer.checkAndPullImages).
 */
export interface NodeTypeDescriptor {
  /** Human-readable name used in log messages ("Pulling <label> image..."). */
  label: string;
  image: string;
  /** If pulling `image` fails and `sourceTag` exists locally, retag it as `image`. */
  fallbackImage?: { sourceTag: string; repo: string; tag: string };
  env?: string[];
  entrypoint?: string[];
  cmd?: string[];
  /** Sets Tty: true, OpenStdin: true, StdinOnce: false on the container. */
  interactiveTty?: boolean;
  /** Merged into HostConfig after the common base (AutoRemove/NetworkMode/CapAdd). */
  hostConfigExtras?: Record<string, unknown>;
  /** When to publish container port 80 to a random host port. */
  publicPort: 'always' | 'whenPublic' | 'never';
  /** Private port whose PublicPort is surfaced in container listings. */
  defaultPrivatePort?: number;
}

const ubuntu: NodeTypeDescriptor = {
  label: 'Ubuntu',
  image: 'derssa/backend-lab-ubuntu:v1',
  cmd: ['/bin/bash'],
  interactiveTty: true,
  publicPort: 'whenPublic',
  defaultPrivatePort: 80
};

export const NODE_TYPES = {
  ubuntu,
  postgres: {
    label: 'Postgres',
    image: 'derssa/backend-lab-postgres:v1',
    fallbackImage: { sourceTag: 'postgres:15-alpine', repo: 'derssa/backend-lab-postgres', tag: 'v1' },
    env: ['POSTGRES_PASSWORD=postgres'],
    entrypoint: ['docker-entrypoint.sh'],
    cmd: ['postgres', '-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off'],
    publicPort: 'never',
    defaultPrivatePort: 5432
  },
  mongo: {
    label: 'MongoDB',
    image: 'derssa/backend-lab-mongo:v1',
    publicPort: 'never',
    defaultPrivatePort: 27017
  },
  redis: {
    label: 'Redis',
    image: 'derssa/backend-lab-redis:v1',
    publicPort: 'never',
    defaultPrivatePort: 6379
  },
  loadbalancer: {
    label: 'Nginx Load Balancer',
    image: 'derssa/backend-lab-nginx:v1',
    publicPort: 'always',
    defaultPrivatePort: 80
  },
  nat: {
    label: 'NAT',
    image: ubuntu.image,
    cmd: ['/bin/bash'],
    interactiveTty: true,
    hostConfigExtras: { Privileged: true, Sysctls: { 'net.ipv4.ip_forward': '1' } },
    publicPort: 'never'
  },
  autoscalinggroup: { ...ubuntu, label: 'Auto Scaling Group' }
} satisfies Record<string, NodeTypeDescriptor>;

/** Alternate type names accepted from callers, kept verbatim in container labels. */
export const NODE_TYPE_ALIASES: Record<string, keyof typeof NODE_TYPES> = {
  sql: 'postgres',
  nosql: 'mongo'
};

export type NodeType = keyof typeof NODE_TYPES | keyof typeof NODE_TYPE_ALIASES;

/** Unknown or missing types fall back to ubuntu. */
export function resolveNodeType(type?: string): NodeTypeDescriptor {
  if (!type) return NODE_TYPES.ubuntu;
  const key = NODE_TYPE_ALIASES[type] ?? type;
  return NODE_TYPES[key as keyof typeof NODE_TYPES] ?? NODE_TYPES.ubuntu;
}
