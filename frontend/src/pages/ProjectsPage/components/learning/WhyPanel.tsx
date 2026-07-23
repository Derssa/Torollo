import { useTranslation } from 'react-i18next';
import { Box, ReceiptText, Terminal } from 'lucide-react';
import Receipt from '../../../../shared/components/Receipt';
import { WHY_RECEIPT_LINES } from './sampleReceipt';

const POINTS = [
  { icon: Box, titleKey: 'learning.landing.whyContainersTitle', bodyKey: 'learning.landing.whyContainersBody' },
  { icon: Terminal, titleKey: 'learning.landing.whyCommandsTitle', bodyKey: 'learning.landing.whyCommandsBody' },
  { icon: ReceiptText, titleKey: 'learning.landing.whyReceiptsTitle', bodyKey: 'learning.landing.whyReceiptsBody' },
] as const;

export default function WhyPanel() {
  const { t } = useTranslation();
  return (
    <div style={styles.panel}>
      <h4 style={styles.title}>{t('learning.landing.whyTitle')}</h4>
      <div style={styles.points}>
        {POINTS.map(({ icon: Icon, titleKey, bodyKey }) => (
          <div key={titleKey} style={styles.point}>
            <div style={styles.pointIcon}>
              <Icon size={14} color="var(--color-accent)" />
            </div>
            <div>
              <div style={styles.pointTitle}>{t(titleKey)}</div>
              <div style={styles.pointBody}>{t(bodyKey)}</div>
            </div>
          </div>
        ))}
      </div>
      <Receipt
        tone="success"
        label={t('learning.landing.sampleReceiptLabel')}
        lines={WHY_RECEIPT_LINES}
        copyText={WHY_RECEIPT_LINES.join('\n')}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    padding: 'var(--space-5)',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)',
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  points: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  point: {
    display: 'flex',
    gap: 'var(--space-3)',
    alignItems: 'flex-start',
  },
  pointIcon: {
    width: '26px',
    height: '26px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-accent-glow)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pointTitle: {
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  pointBody: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    marginTop: '2px',
  },
};
