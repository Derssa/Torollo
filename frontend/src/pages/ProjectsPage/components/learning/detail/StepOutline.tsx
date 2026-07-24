import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { RoadmapStep } from '../../../../../shared/types/roadmap';

interface StepOutlineProps {
  steps: RoadmapStep[];
  /** Step ids whose latest validation passed. */
  passedStepIds: Record<string, boolean>;
  /** Index of the step the learner would resume on, or -1 when not started. */
  currentIndex: number;
}

/**
 * The roadmap's real step titles, in order. Titles only: instructions, hints
 * and solutions belong to the player, where the pedagogy lives.
 */
export default function StepOutline({ steps, passedStepIds, currentIndex }: StepOutlineProps) {
  const { t } = useTranslation();

  return (
    <section style={styles.panel}>
      <h2 style={styles.title}>{t('learning.detail.outline.title')}</h2>
      <p style={styles.subtitle}>{t('learning.detail.outline.subtitle')}</p>

      <ol style={styles.list}>
        {steps.map((step, index) => {
          const passed = passedStepIds[step.id] === true;
          const current = index === currentIndex;
          return (
            <li key={step.id} style={{ ...styles.item, ...(current ? styles.itemCurrent : null) }}>
              <span
                style={{
                  ...styles.marker,
                  ...(passed ? styles.markerPassed : null),
                  ...(current ? styles.markerCurrent : null),
                }}
              >
                {passed ? <Check size={13} aria-label={t('learning.detail.outline.passed')} /> : index + 1}
              </span>
              <span style={styles.stepTitle}>{step.title}</span>
              {current && <span style={styles.currentLabel}>{t('learning.detail.outline.current')}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    padding: 'var(--space-5)',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)',
  },
  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    margin: 'var(--space-1) 0 var(--space-4) 0',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
  },
  itemCurrent: {
    background: 'var(--color-accent-glow)',
  },
  marker: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    flexShrink: 0,
    borderRadius: '50%',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-subtle)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
  },
  markerPassed: {
    border: '1px solid color-mix(in srgb, var(--color-success) 40%, transparent)',
    background: 'var(--color-success-glow)',
    color: 'var(--color-success)',
  },
  markerCurrent: {
    border: '2px solid var(--color-accent)',
    background: 'var(--bg-surface-solid)',
    color: 'var(--color-accent)',
  },
  stepTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--text-md)',
    color: 'var(--color-text-primary)',
    lineHeight: 1.4,
  },
  currentLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--color-accent)',
    whiteSpace: 'nowrap',
  },
};
