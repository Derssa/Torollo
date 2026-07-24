import { useTranslation } from 'react-i18next';

interface PrerequisitesPanelProps {
  /** The roadmap's declared prerequisites, in the author's order. */
  prerequisites: string[];
}

/** What the learner needs in place before launching. Free-form author text. */
export default function PrerequisitesPanel({ prerequisites }: PrerequisitesPanelProps) {
  const { t } = useTranslation();
  if (prerequisites.length === 0) return null;

  return (
    <section style={styles.panel}>
      <h2 style={styles.title}>{t('learning.detail.prerequisites.title')}</h2>
      <ul style={styles.list}>
        {prerequisites.map(item => (
          <li key={item} style={styles.item}>
            <span style={styles.bullet} aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
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
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  bullet: {
    width: '5px',
    height: '5px',
    marginTop: '7px',
    flexShrink: 0,
    borderRadius: '50%',
    background: 'var(--color-text-muted)',
  },
};
