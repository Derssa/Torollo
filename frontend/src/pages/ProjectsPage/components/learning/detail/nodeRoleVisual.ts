import { Box, Braces, Database, GitFork, Globe, Layers, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NodeRole } from '../../../../../features/learning/roadmapTopology';

interface RoleVisual {
  Icon: LucideIcon;
  /** Node identity color token — decorative, never a semantic status. */
  color: string;
}

/** Icon and identity color per derived node role, for the topology chips. */
export const ROLE_VISUALS: Record<NodeRole, RoleVisual> = {
  postgres: { Icon: Database, color: 'var(--node-postgres)' },
  redis: { Icon: Zap, color: 'var(--node-redis)' },
  mongo: { Icon: Braces, color: 'var(--node-mongo)' },
  loadBalancer: { Icon: GitFork, color: 'var(--node-load-balancer)' },
  autoScaling: { Icon: Layers, color: 'var(--node-auto-scaling)' },
  httpService: { Icon: Globe, color: 'var(--node-http)' },
  container: { Icon: Box, color: 'var(--color-text-muted)' },
};
