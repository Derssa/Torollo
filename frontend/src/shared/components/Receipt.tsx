import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';

interface ReceiptProps {
  /** Rendered as-is, one per row — always the real command/value, never a paraphrase. */
  lines: string[];
  /** Color of the 2px left border. */
  tone?: 'success' | 'accent' | 'warning' | 'danger' | 'neutral';
  /** Small sans eyebrow above the block (e.g. "Sample validation receipt"). */
  label?: string;
  /** Shows a copy button when set. */
  copyText?: string;
}

const TONE_COLORS: Record<NonNullable<ReceiptProps['tone']>, string> = {
  success: 'var(--color-success)',
  accent: 'var(--color-accent)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  neutral: 'var(--color-text-muted)',
};

/**
 * The signature evidence block (DESIGN §2): a quiet monospace transcript of
 * the real thing that happened under the hood. Fades in once, never animates
 * for attention.
 */
export default function Receipt({ lines, tone = 'neutral', label, copyText }: ReceiptProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const handleCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied — the button simply stays in its idle state.
    }
  };

  return (
    <div>
      {label && <span style={styles.label}>{label}</span>}
      <div
        className="receipt-appear"
        style={{ ...styles.block, borderLeft: `2px solid ${TONE_COLORS[tone]}` }}
      >
        <div style={styles.lines}>
          {lines.map((line, i) => (
            <span key={i} style={styles.line}>
              {line}
            </span>
          ))}
        </div>
        {copyText && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? t('common.copied') : t('common.copy')}
            title={copied ? t('common.copied') : t('common.copy')}
            style={styles.copyBtn}
          >
            {copied ? (
              <Check size={13} color="var(--color-success)" />
            ) : (
              <Copy size={13} color="var(--color-text-muted)" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  label: {
    display: 'block',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-muted)',
    marginBottom: 'var(--space-2)',
  },
  block: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3)',
    animation: 'receiptFadeIn 120ms ease-out',
  },
  lines: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    minWidth: 0,
    flex: 1,
  },
  line: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    overflowWrap: 'anywhere',
  },
  copyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    padding: 0,
  },
};
