import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import Button from '../../../../shared/components/Button';
import ProgressBar from '../../../../shared/components/ProgressBar';
import { roadmapVisual } from './roadmapVisual';
import type { ProgressEntrySummary, RoadmapSummary } from '../../../../shared/types/roadmap';

interface ResumeCardProps {
  summary: RoadmapSummary;
  progress: ProgressEntrySummary;
  onResume: () => void;
}

/**
 * Top of the learning page for anyone who has already started something: the
 * one question a returning user has is "where was I?", so the answer gets the
 * first card and the only primary button on the screen. The pitch (hero,
 * why-panel, sample receipt) is shown to first-timers instead — see
 * LearningSection.
 */
export default function ResumeCard({ summary, progress, onResume }: ResumeCardProps) {
  const { t } = useTranslation();
  const { Icon } = roadmapVisual(summary.id);
  // The player resumes at the true first incomplete step; this is the label.
  const current = Math.min(progress.completedSteps + 1, summary.stepCount);

  return (
    <div style={styles.card}>
      <span style={styles.eyebrow}>{t('learning.landing.resumeLabel')}</span>
      <div style={styles.row}>
        <span style={styles.iconTile} aria-hidden>
          <Icon size={20} />
        </span>
        <div style={styles.body}>
          <h3 style={styles.title}>{summary.title}</h3>
          <div style={styles.progressRow}>
            <div style={styles.progressTrack}>
              <ProgressBar
                value={progress.completedSteps}
                max={summary.stepCount}
                tone="accent"
                ariaLabel={summary.title}
              />
            </div>
            <span style={styles.stepLabel}>
              {t('learning.landing.stepOf', { current, total: summary.stepCount })}
            </span>
          </div>
        </div>
        <Button variant="primary" size="lg" onClick={onResume}>
          {t('learning.landing.resumeAction')}
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    padding: 'var(--space-5)',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
  },
  eyebrow: {
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-muted)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
  },
  iconTile: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-color)',
    color: 'var(--color-text-secondary)',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    flex: '1 1 240px',
    minWidth: 0,
  },
  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
    lineHeight: 1.3,
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  progressTrack: {
    flex: 1,
    minWidth: 0,
  },
  stepLabel: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap',
  },
};
