import { Database, Map, Network } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface RoadmapVisual {
  Icon: LucideIcon;
}

/**
 * Icon per known roadmap, for the showcase card and briefing tiles. Shape
 * only — the tile is neutral, since a roadmap's hue never meant anything.
 * Community roadmaps (unknown ids) fall back to a generic visual.
 */
const VISUALS: Record<string, RoadmapVisual> = {
  'cache-aside-redis': { Icon: Database },
  'resilient-three-tier': { Icon: Network },
};

const FALLBACK: RoadmapVisual = { Icon: Map };

export function roadmapVisual(roadmapId: string): RoadmapVisual {
  return VISUALS[roadmapId] ?? FALLBACK;
}
