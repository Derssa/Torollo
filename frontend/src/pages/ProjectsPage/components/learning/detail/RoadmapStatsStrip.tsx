import { useTranslation } from 'react-i18next';
import type { SkillKey } from '../../../../../features/learning/roadmapTopology';
import type { RoadmapDifficulty } from '../../../../../shared/types/roadmap';

interface RoadmapStatsStripProps {
  difficulty?: RoadmapDifficulty;
  stepCount: number;
  estimatedMinutes?: number;
  skills: SkillKey[];
}

/**
 * The four facts a learner weighs before committing, on one row — label above
 * value, no icons or color coding, since none of the four is a status.
 * Optional roadmap fields simply drop their cell: a roadmap that declares no
 * duration shows three cells, never an empty one.
 */
export default function RoadmapStatsStrip({
  difficulty,
  stepCount,
  estimatedMinutes,
  skills,
}: RoadmapStatsStripProps) {
  const { t } = useTranslation();

  return (
    <div style={styles.strip}>
      {difficulty && (
        <Cell label={t('learning.detail.stat.difficulty')}>
          <span style={styles.value}>{t(`learning.catalog.difficulty.${difficulty}`)}</span>
        </Cell>
      )}

      <Cell label={t('learning.detail.stat.steps')}>
        <span style={styles.value}>{stepCount}</span>
      </Cell>

      {estimatedMinutes != null && (
        <Cell label={t('learning.detail.stat.duration')}>
          <span style={styles.value}>{t('learning.catalog.minutes', { count: estimatedMinutes })}</span>
        </Cell>
      )}

      {skills.length > 0 && (
        // Chips need more room than a one-line stat, or they wrap three deep.
        <Cell label={t('learning.detail.stat.skills')} grow={2} basis="300px">
          <span style={styles.skills}>
            {skills.map(skill => (
              <span key={skill} style={styles.skill}>
                {t(`learning.detail.skill.${skill}`)}
              </span>
            ))}
          </span>
        </Cell>
      )}
    </div>
  );
}

function Cell({
  label,
  children,
  grow = 1,
  basis = '150px',
}: {
  label: string;
  children: React.ReactNode;
  grow?: number;
  basis?: string;
}) {
  return (
    <div style={{ ...styles.cell, flex: `${grow} 1 ${basis}` }}>
      <span style={styles.label}>{label}</span>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  strip: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-5)',
    padding: 'var(--space-4) var(--space-5)',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    minWidth: 0,
  },
  label: {
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-muted)',
  },
  value: {
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  skills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-1)',
  },
  skill: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px var(--space-2)',
  },
};
