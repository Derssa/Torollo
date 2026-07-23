import { Database, Map, Network } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface RoadmapVisual {
  Icon: LucideIcon;
  /** Color token driving the icon tile tint — decorative, not semantic. */
  color: string;
}

/**
 * Icon + accent per known roadmap for the showcase card's icon tile.
 * Community roadmaps (unknown ids) fall back to a generic visual.
 */
const VISUALS: Record<string, RoadmapVisual> = {
  'cache-aside-redis': { Icon: Database, color: 'var(--color-accent)' },
  'resilient-three-tier': { Icon: Network, color: 'var(--color-warning)' },
};

const FALLBACK: RoadmapVisual = { Icon: Map, color: 'var(--color-accent)' };

export function roadmapVisual(roadmapId: string): RoadmapVisual {
  return VISUALS[roadmapId] ?? FALLBACK;
}
