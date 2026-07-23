import { useTranslation } from 'react-i18next';
import { CheckCircle2, ClipboardList, Clock } from 'lucide-react';
import ProgressBar from '../../../../shared/components/ProgressBar';
import DifficultyChip from '../../../../features/learning/components/DifficultyChip';
import { roadmapVisual } from './roadmapVisual';
import type { ProgressEntrySummary, RoadmapSummary } from '../../../../shared/types/roadmap';

interface RoadmapShowcaseCardProps {
  summary: RoadmapSummary;
  /** Most recent play-through of this roadmap across all projects, if any. */
  progress?: ProgressEntrySummary;
  onOpen: () => void;
}

export default function RoadmapShowcaseCard({ summary, progress, onOpen }: RoadmapShowcaseCardProps) {
  const { t } = useTranslation();
  const started = (progress?.completedSteps ?? 0) > 0;
  const completed = started && (progress as ProgressEntrySummary).completedSteps >= summary.stepCount;
  const { Icon, color } = roadmapVisual(summary.id);

  return (
    <button onClick={onOpen} style={styles.card}>
      <div style={styles.header}>
        <span
          style={{
            ...styles.iconTile,
            color,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
          }}
          aria-hidden
        >
          <Icon size={20} />
        </span>
        <span style={styles.title}>{summary.title}</span>
      </div>
      <span style={styles.description}>{summary.description}</span>
      {summary.difficulty && (
        <div>
          <DifficultyChip difficulty={summary.difficulty} />
        </div>
      )}
      <div style={styles.meta}>
        <span style={styles.metaItem}>
          <ClipboardList size={13} />
          {t('learning.catalog.steps', { count: summary.stepCount })}
        </span>
        {summary.estimatedMinutes != null && (
          <span style={styles.metaItem}>
            <Clock size={13} />
            {t('learning.catalog.minutes', { count: summary.estimatedMinutes })}
          </span>
        )}
      </div>
      {started && (
        <div style={styles.progressBlock}>
          <ProgressBar
            value={(progress as ProgressEntrySummary).completedSteps}
            max={summary.stepCount}
            tone={completed ? 'success' : 'accent'}
            ariaLabel={summary.title}
          />
          {completed ? (
            <span style={{ ...styles.progressLabel, color: 'var(--color-success)' }}>
              <CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              {t('learning.landing.completedLabel')}
            </span>
          ) : (
            <span style={{ ...styles.progressLabel, color: 'var(--color-accent)' }}>
              {t('learning.landing.continueLabel', {
                // Approximation: the resume step is usually right after the
                // passed ones; the player itself resumes at the true first
                // incomplete step.
                current: Math.min((progress as ProgressEntrySummary).completedSteps + 1, summary.stepCount),
                total: summary.stepCount,
              })}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--bg-surface-solid)',
    boxShadow: 'var(--shadow-sm)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font-sans)',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  iconTile: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 'var(--radius-md)',
  },
  title: {
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    lineHeight: 1.3,
  },
  description: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  meta: {
    display: 'flex',
    gap: 'var(--space-4)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-muted)',
    // Pushes the meta/progress footer to the card bottom so rows align
    // across cards with different description lengths.
    marginTop: 'auto',
    paddingTop: 'var(--space-2)',
    borderTop: '1px solid var(--border-color)',
  },
  metaItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  progressLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
  },
};
