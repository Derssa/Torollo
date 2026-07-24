import { useTranslation } from 'react-i18next';
import { ReceiptText, ScanSearch, Terminal } from 'lucide-react';
import Receipt from '../../../../../shared/components/Receipt';
import { deriveSampleChecks } from '../../../../../features/learning/roadmapChecks';
import type { Roadmap } from '../../../../../shared/types/roadmap';

/** Evidence of a real play-through, when this roadmap has one. */
export interface LastRun {
  projectName: string;
  passed: number;
  total: number;
  /** Most recent validation across the roadmap's steps, if any ran. */
  lastCheckedAt?: string;
  /** Title of the step the learner would resume on; absent once complete. */
  nextStepTitle?: string;
}

interface VerificationPanelProps {
  roadmap: Roadmap;
  lastRun?: LastRun;
}

const POINTS = [
  { Icon: ScanSearch, titleKey: 'learning.detail.verify.liveTitle', bodyKey: 'learning.detail.verify.liveBody' },
  {
    Icon: ReceiptText,
    titleKey: 'learning.detail.verify.receiptsTitle',
    bodyKey: 'learning.detail.verify.receiptsBody',
  },
  {
    Icon: Terminal,
    titleKey: 'learning.detail.verify.commandsTitle',
    bodyKey: 'learning.detail.verify.commandsBody',
  },
] as const;

/**
 * How the grading works, ending in a receipt (DESIGN §2). Before the first
 * play-through the receipt is a sample built from this roadmap's own checks
 * and labelled as such; afterwards it is the learner's real progress.
 */
export default function VerificationPanel({ roadmap, lastRun }: VerificationPanelProps) {
  const { t, i18n } = useTranslation();

  const sampleLines = deriveSampleChecks(roadmap).map(line => t(line.key, line.params));
  const lines = lastRun ? lastRunLines(lastRun) : sampleLines;

  function lastRunLines(run: LastRun): string[] {
    const out = [t('learning.detail.receipt.stepsPassing', { passed: run.passed, total: run.total })];
    if (run.lastCheckedAt) {
      const date = new Date(run.lastCheckedAt).toLocaleString(i18n.language, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      out.push(t('learning.detail.receipt.lastChecked', { date }));
    }
    out.push(
      run.nextStepTitle
        ? t('learning.detail.receipt.nextStep', { title: run.nextStepTitle })
        : t('learning.detail.receipt.allPassing')
    );
    return out;
  }

  return (
    <section style={styles.panel}>
      <h2 style={styles.title}>{t('learning.detail.verify.title')}</h2>

      <div style={styles.points}>
        {POINTS.map(({ Icon, titleKey, bodyKey }) => (
          <div key={titleKey} style={styles.point}>
            <span style={styles.pointIcon} aria-hidden>
              <Icon size={14} color="var(--color-accent)" />
            </span>
            <div>
              <div style={styles.pointTitle}>{t(titleKey)}</div>
              <div style={styles.pointBody}>{t(bodyKey)}</div>
            </div>
          </div>
        ))}
      </div>

      {lines.length > 0 && (
        <Receipt
          tone={lastRun ? 'accent' : 'success'}
          label={
            lastRun
              ? t('learning.detail.receipt.lastRunLabel', { project: lastRun.projectName })
              : t('learning.detail.receipt.sampleLabel')
          }
          lines={lines}
          copyText={lines.join('\n')}
        />
      )}
    </section>
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
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    flexShrink: 0,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-accent-glow)',
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
