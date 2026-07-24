import DifficultyChip from '../../../../../features/learning/components/DifficultyChip';
import { roadmapVisual } from '../roadmapVisual';
import type { RoadmapSummary } from '../../../../../shared/types/roadmap';

interface RoadmapDetailHeroProps {
  summary: RoadmapSummary;
  /** The roadmap file's description once loaded; the catalogue's until then. */
  description: string;
}

/** Identity block of the briefing page: icon, difficulty, title, pitch. */
export default function RoadmapDetailHero({ summary, description }: RoadmapDetailHeroProps) {
  const { Icon, color } = roadmapVisual(summary.id);

  return (
    <header style={styles.hero}>
      <span
        style={{ ...styles.iconTile, color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
        aria-hidden
      >
        <Icon size={28} />
      </span>
      <div style={styles.copy}>
        {summary.difficulty && (
          <div>
            <DifficultyChip difficulty={summary.difficulty} />
          </div>
        )}
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
    width: '56px',
    height: '56px',
    flexShrink: 0,
    borderRadius: 'var(--radius-lg)',
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
