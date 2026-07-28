import { useTranslation } from 'react-i18next';
import { ArrowRight, GraduationCap } from 'lucide-react';
import Button from '../../../../shared/components/Button';

interface LearningHeroProps {
  onStart: () => void;
  onBrowse: () => void;
}

/**
 * The promise and the one action that follows from it. The sample receipt
 * lives in the why-panel next door — showing it twice on one screen taught
 * nothing the second time.
 */
export default function LearningHero({ onStart, onBrowse }: LearningHeroProps) {
  const { t } = useTranslation();
  return (
    <div style={styles.hero}>
      <h3 style={styles.title}>{t('learning.landing.heroTitle')}</h3>
      <p style={styles.body}>{t('learning.landing.heroBody')}</p>
      <div style={styles.ctaRow}>
        <Button variant="primary" size="lg" onClick={onStart}>
          <GraduationCap size={16} />
          {t('learning.landing.startRoadmap')}
        </Button>
        <button onClick={onBrowse} style={styles.browseLink}>
          {t('learning.landing.browseRoadmaps')}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hero: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    padding: 'var(--space-6)',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
  },
  title: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
    letterSpacing: '-0.5px',
    maxWidth: '620px',
  },
  body: {
    fontSize: 'var(--text-md)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    margin: 0,
    maxWidth: '560px',
  },
  ctaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
    marginTop: 'var(--space-1)',
  },
  browseLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    background: 'none',
    border: 'none',
    padding: 'var(--space-2)',
    color: 'var(--color-accent)',
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
  },
};
