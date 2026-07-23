import { useTranslation } from 'react-i18next';
import { Database } from 'lucide-react';
import Button from '../../../shared/components/Button';
import Receipt from '../../../shared/components/Receipt';

interface FirstRunHeroProps {
  onStartLearning: () => void;
  onStartScratch: () => void;
}

/**
 * Shown instead of the project grid while no project exists: the page must
 * *be* the pitch, not assume the user already knows Torollo (DESIGN §4.1).
 */
export default function FirstRunHero({ onStartLearning, onStartScratch }: FirstRunHeroProps) {
  const { t } = useTranslation();
  return (
    <div style={styles.hero}>
      <div style={styles.copy}>
        <h2 style={styles.title}>{t('projects.firstRun.title')}</h2>
        <p style={styles.body}>{t('projects.firstRun.body')}</p>
        <div style={styles.ctaRow}>
          <Button variant="primary" size="lg" onClick={onStartLearning}>
            {t('projects.firstRun.startLearning')}
          </Button>
          <Button size="lg" onClick={onStartScratch}>
            {t('projects.firstRun.startScratch')}
          </Button>
        </div>
      </div>
      {/* Mini-canvas vignette in the product's real visual language: one
          node card with a live status dot, plus a receipt. Decorative. */}
      <div style={styles.visual} aria-hidden="true">
        <div style={styles.nodeCard}>
          <div style={styles.nodeIcon}>
            <Database size={16} color="var(--color-danger)" />
          </div>
          <div>
            <div style={styles.nodeName}>redis-cache</div>
            <div style={styles.nodeSub}>Redis</div>
          </div>
          <span style={styles.statusDot} />
        </div>
        <Receipt
          tone="success"
          lines={['container redis-cache up', 'port 6379 → localhost:56379']}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hero: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-8)',
    flexWrap: 'wrap',
    padding: 'var(--space-8)',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)',
  },
  copy: {
    flex: '2 1 380px',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  title: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  body: {
    fontSize: 'var(--text-md)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    margin: 0,
    maxWidth: '520px',
  },
  ctaRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },
  visual: {
    flex: '1 1 260px',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    maxWidth: '320px',
  },
  nodeCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md)',
  },
  nodeIcon: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-danger-glow)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeName: {
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  nodeSub: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-muted)',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--color-success)',
    marginLeft: 'auto',
    boxShadow: '0 0 6px color-mix(in srgb, var(--color-success) 60%, transparent)',
  },
};
