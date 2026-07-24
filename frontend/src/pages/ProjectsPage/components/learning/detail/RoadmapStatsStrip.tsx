import { useTranslation } from 'react-i18next';
import { BarChart3, Clock, GraduationCap, ListChecks } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SkillKey } from '../../../../../features/learning/roadmapTopology';
import type { RoadmapDifficulty } from '../../../../../shared/types/roadmap';

interface RoadmapStatsStripProps {
  difficulty?: RoadmapDifficulty;
  stepCount: number;
  estimatedMinutes?: number;
  skills: SkillKey[];
}

const DIFFICULTY_COLORS: Record<RoadmapDifficulty, string> = {
  beginner: 'var(--color-success)',
  intermediate: 'var(--color-warning)',
  advanced: 'var(--color-danger)',
};

/**
 * The four facts a learner weighs before committing, on one row. Optional
 * roadmap fields simply drop their cell — a roadmap that declares no duration
 * shows three cells, never an empty one.
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
        <Cell icon={BarChart3} label={t('learning.detail.stat.difficulty')}>
          <span style={styles.value}>
            <span style={{ ...styles.dot, background: DIFFICULTY_COLORS[difficulty] }} aria-hidden />
            {t(`learning.catalog.difficulty.${difficulty}`)}
          </span>
        </Cell>
      )}

      <Cell icon={ListChecks} label={t('learning.detail.stat.steps')}>
        <span style={styles.value}>{stepCount}</span>
      </Cell>

      {estimatedMinutes != null && (
        <Cell icon={Clock} label={t('learning.detail.stat.duration')}>
          <span style={styles.value}>{t('learning.catalog.minutes', { count: estimatedMinutes })}</span>
        </Cell>
      )}

      {skills.length > 0 && (
        // Chips need more room than a one-line stat, or they wrap three deep.
        <Cell icon={GraduationCap} label={t('learning.detail.stat.skills')} grow={2} basis="300px">
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
  icon: Icon,
  label,
  children,
  grow = 1,
  basis = '180px',
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  grow?: number;
  basis?: string;
}) {
  return (
    <div style={{ ...styles.cell, flex: `${grow} 1 ${basis}` }}>
      <span style={styles.cellIcon} aria-hidden>
        <Icon size={16} color="var(--color-accent)" />
      </span>
      <div style={styles.cellText}>
        <span style={styles.label}>{label}</span>
        {children}
      </div>
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
    boxShadow: 'var(--shadow-sm)',
  },
  cell: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    minWidth: 0,
  },
  cellIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '30px',
    flexShrink: 0,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-accent-glow)',
  },
  cellText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
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
