import type { Roadmap, RoadmapValidator } from '../../shared/types/roadmap';

/**
 * What a roadmap will make the learner build, read off the roadmap's own
 * validators instead of a declared field.
 *
 * The format has no architecture or skills metadata (docs/roadmap-format.md),
 * and adding one would let the briefing drift from what is actually checked.
 * The checks are the contract, so they are the source: a roadmap that asserts
 * `redis_key_exists` on node "cache" is, by definition, a roadmap where "cache"
 * is a Redis. Nothing here can go stale, and community roadmaps get it for free.
 *
 * Validator params are inert JSON typed as `unknown`; every read is defensive
 * and unknown validator types are skipped for roles and skills but still
 * contribute their nodes.
 */

/** Node role, strongest evidence wins. Keys — the UI translates them. */
export type NodeRole =
  | 'postgres'
  | 'redis'
  | 'mongo'
  | 'loadBalancer'
  | 'autoScaling'
  | 'httpService'
  | 'container';

/** Skill keys, in the order the UI shows them. */
export type SkillKey =
  | 'containers'
  | 'sql'
  | 'redis'
  | 'mongo'
  | 'networking'
  | 'securityGroups'
  | 'loadBalancing'
  | 'autoScaling'
  | 'httpServices';

export interface TopologyNode {
  /** The canvas node name the learner must use, e.g. "cache". */
  name: string;
  role: NodeRole;
}

export interface TopologyLink {
  source: string;
  target: string;
  /** Absent when the roadmap accepts any port (`edge_exists` without `port`). */
  port?: number;
  /** `allow`: traffic must reach. `deny`: traffic must be blocked. */
  mode: 'allow' | 'deny';
}

export interface RoadmapTopology {
  nodes: TopologyNode[];
  links: TopologyLink[];
  skills: SkillKey[];
}

/** How many skill chips the stats strip shows before the row gets noisy. */
const MAX_SKILLS = 6;

/**
 * Role implied by a validator targeting a node. A validator that reads a
 * Redis key proves the node is a Redis; one that just fetches HTTP only proves
 * it serves HTTP, so it must never win over a store's identity.
 */
const ROLE_BY_VALIDATOR: Record<string, NodeRole> = {
  table_exists: 'postgres',
  redis_key_exists: 'redis',
  mongo_collection_exists: 'mongo',
  lb_upstreams: 'loadBalancer',
  asg_replicas: 'autoScaling',
  http_get_contains: 'httpService',
  container_running: 'container',
};

/** Higher wins when several validators target the same node. */
const ROLE_STRENGTH: Record<NodeRole, number> = {
  postgres: 3,
  redis: 3,
  mongo: 3,
  loadBalancer: 3,
  autoScaling: 3,
  httpService: 2,
  container: 1,
};

const SKILL_BY_VALIDATOR: Record<string, SkillKey> = {
  container_running: 'containers',
  table_exists: 'sql',
  redis_key_exists: 'redis',
  mongo_collection_exists: 'mongo',
  edge_exists: 'networking',
  port_denied: 'securityGroups',
  lb_upstreams: 'loadBalancing',
  asg_replicas: 'autoScaling',
  http_get_contains: 'httpServices',
};

function stringParam(validator: RoadmapValidator, key: string): string | null {
  const value = validator.params?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function portParam(validator: RoadmapValidator): number | undefined {
  const value = validator.params?.port;
  return typeof value === 'number' ? value : undefined;
}

/** Reads the topology and skills a roadmap's checks assert. */
export function deriveTopology(roadmap: Roadmap): RoadmapTopology {
  // Insertion-ordered: nodes appear in the order the roadmap first checks
  // them, which is the order the learner builds them.
  const roles = new Map<string, NodeRole>();
  const links: TopologyLink[] = [];
  const seenLinks = new Set<string>();
  const skills: SkillKey[] = [];

  const noteNode = (name: string | null, role: NodeRole) => {
    if (!name) return;
    const current = roles.get(name);
    if (!current || ROLE_STRENGTH[role] > ROLE_STRENGTH[current]) {
      roles.set(name, role);
    }
  };

  for (const step of roadmap.steps) {
    for (const validator of step.validators) {
      const role = ROLE_BY_VALIDATOR[validator.type] ?? 'container';
      noteNode(stringParam(validator, 'node'), role);

      const source = stringParam(validator, 'source');
      const target = stringParam(validator, 'target');
      // Both endpoints of a connectivity check are nodes on the canvas, but
      // the check says nothing about what they run.
      noteNode(source, 'container');
      noteNode(target, 'container');

      if (source && target && (validator.type === 'edge_exists' || validator.type === 'port_denied')) {
        const port = portParam(validator);
        const mode = validator.type === 'port_denied' ? 'deny' : 'allow';
        const key = `${source}>${target}:${port ?? 'any'}:${mode}`;
        if (!seenLinks.has(key)) {
          seenLinks.add(key);
          links.push({ source, target, port, mode });
        }
      }

      const skill = SKILL_BY_VALIDATOR[validator.type];
      if (skill && !skills.includes(skill)) {
        skills.push(skill);
      }
    }
  }

  return {
    nodes: [...roles].map(([name, role]) => ({ name, role })),
    links,
    skills: skills.slice(0, MAX_SKILLS),
  };
}
