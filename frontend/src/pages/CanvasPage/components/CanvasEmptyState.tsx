import { useTranslation } from 'react-i18next';
import { ArrowRight, GraduationCap } from 'lucide-react';
import Button from '../../../shared/components/Button';

interface CanvasEmptyStateProps {
  /** Opens the learning panel on the roadmap catalogue. */
  onFollowRoadmap: () => void;
}

/**
 * Shown centered on the dotted grid while the canvas holds nothing — no
 * container, no subnet — and the learning panel is closed. A user must never
 * face an empty canvas with no proposed next step (DESIGN §4.2): the guided
 * roadmaps are the product's loop, and nothing else on this screen says so.
 *
 * It never swallows a drop: only the button takes pointer events, so drags
 * from the node library land on the canvas underneath as usual.
 */
export default function CanvasEmptyState({ onFollowRoadmap }: CanvasEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div style={styles.wrapper}>
      <div style={styles.panel}>
        <h2 style={styles.title}>{t('canvas.empty.title')}</h2>
        <p style={styles.body}>{t('canvas.empty.body')}</p>
        <div style={styles.actions}>
          <Button variant="primary" size="lg" onClick={onFollowRoadmap} style={styles.action}>
            <GraduationCap size={16} />
            {t('canvas.empty.followRoadmap')}
          </Button>
          <span style={styles.hint}>
            {t('canvas.empty.dragHint')}
            <ArrowRight size={14} style={{ flexShrink: 0 }} />
          </span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Below the floating VPC header (z-index 10), above the React Flow pane.
    zIndex: 5,
    pointerEvents: 'none',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-6)',
    maxWidth: '420px',
    textAlign: 'center',
  },
  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  body: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    margin: 0,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-1)',
  },
  action: {
    pointerEvents: 'auto',
  },
  hint: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-muted)',
  },
};
