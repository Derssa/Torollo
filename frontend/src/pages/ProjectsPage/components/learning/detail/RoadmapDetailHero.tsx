import { roadmapVisual } from '../roadmapVisual';
import type { RoadmapSummary } from '../../../../../shared/types/roadmap';

interface RoadmapDetailHeroProps {
  summary: RoadmapSummary;
  /** The roadmap file's description once loaded; the catalogue's until then. */
  description: string;
}

/**
 * Identity block of the briefing page: icon, title, pitch. Difficulty is not
 * repeated here — the stats strip right below states it once.
 */
export default function RoadmapDetailHero({ summary, description }: RoadmapDetailHeroProps) {
  const { Icon } = roadmapVisual(summary.id);

  return (
    <header style={styles.hero}>
      <span style={styles.iconTile} aria-hidden>
        <Icon size={26} />
      </span>
      <div style={styles.copy}>
        <h1 style={styles.title}>{summary.title}</h1>
        <p style={styles.description}>{description}</p>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hero: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-5)',
  },
  iconTile: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '52px',
    height: '52px',
    flexShrink: 0,
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-color)',
    color: 'var(--color-text-secondary)',
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    minWidth: 0,
  },
  title: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  description: {
    fontSize: 'var(--text-md)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    margin: 0,
    maxWidth: '640px',
  },
};
