import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';

/** One validated check: what was looked at, and what was observed. */
export interface ReceiptCheck {
  /** What the check asserted — the real validator's subject, never a paraphrase. */
  label: string;
  /** What was observed, right-aligned so a column of results reads at a glance. */
  value: string;
}

interface ReceiptProps {
  /** Plain transcript rows, rendered as-is. Use `checks` when results have a value column. */
  lines?: string[];
  /** Structured rows: a pass glyph, the assertion, and the observed value. */
  checks?: ReceiptCheck[];
  /** Small sans eyebrow above the block (e.g. "Sample validation receipt"). */
  label?: string;
  /** Verdict shown next to the eyebrow. Only ever set when every check passed. */
  verdict?: string;
  /** Muted mono line at the top of the block — what this receipt is about. */
  context?: string;
  /** Muted mono line in the footer, opposite the copy button. */
  footer?: string;
  /** Shows a copy button when set. */
  copyText?: string;
}

/**
 * The signature evidence block (DESIGN §2): a quiet monospace transcript of
 * the real thing that happened under the hood. Fades in once, never animates
 * for attention. The only color it carries is the pass glyph and the verdict —
 * both genuine statuses; every other fact stays neutral.
 */
export default function Receipt({
  lines,
  checks,
  label,
  verdict,
  context,
  footer,
  copyText,
}: ReceiptProps) {
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

  const copyButton = copyText && (
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
  );

  // The footer row owns the copy button as soon as the receipt has one, so the
  // transcript itself is never crowded by chrome.
  const hasFooterRow = Boolean(footer) || (Boolean(copyText) && Boolean(checks));

  // The checks variant is the standalone evidence card of DESIGN §2: the
  // header lives inside it and the transcript sits on the card itself, so the
  // page never stacks a box inside a box.
  const isCard = Boolean(checks);

  return (
    <div style={isCard ? styles.card : undefined} className={isCard ? 'receipt-appear' : undefined}>
      {(label || verdict) && (
        <div style={isCard ? { ...styles.head, ...styles.cardHead } : styles.head}>
          {label && <span style={isCard ? styles.cardTitle : styles.label}>{label}</span>}
          {verdict && (
            <span style={isCard ? styles.verdictPill : styles.verdict}>
              <Check size={12} strokeWidth={2.5} />
              {verdict}
            </span>
          )}
        </div>
      )}
      <div className={isCard ? undefined : 'receipt-appear'} style={isCard ? undefined : styles.block}>
        {context && <div style={styles.context}>{context}</div>}

        {checks && (
          <div style={styles.checks}>
            {checks.map(({ label: checkLabel, value }, i) => (
              <Fragment key={i}>
                <Check size={12} strokeWidth={2.5} color="var(--color-success)" style={styles.checkGlyph} />
                <span style={styles.checkLabel}>{checkLabel}</span>
                <span style={styles.checkValue}>{value}</span>
              </Fragment>
            ))}
          </div>
        )}

        {lines && (
          <div style={styles.linesRow}>
            <div style={styles.lines}>
              {lines.map((line, i) => (
                <span key={i} style={styles.line}>
                  {line}
                </span>
              ))}
            </div>
            {!hasFooterRow && copyButton}
          </div>
        )}

        {hasFooterRow && (
          <div style={styles.footer}>
            <span style={styles.footerText}>{footer}</span>
            {copyButton}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-5)',
    animation: 'receiptFadeIn 120ms ease-out',
  },
  cardTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  verdictPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 10px',
    borderRadius: '999px',
    background: 'var(--color-success-glow)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--color-success)',
    whiteSpace: 'nowrap',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-2)',
  },
  cardHead: {
    marginBottom: 'var(--space-4)',
  },
  label: {
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-muted)',
  },
  verdict: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--color-success)',
    whiteSpace: 'nowrap',
  },
  block: {
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3)',
    animation: 'receiptFadeIn 120ms ease-out',
  },
  context: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-muted)',
    marginBottom: 'var(--space-3)',
  },
  checks: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    columnGap: 'var(--space-4)',
    rowGap: 'var(--space-2)',
    alignItems: 'baseline',
  },
  checkGlyph: {
    alignSelf: 'center',
  },
  checkLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-primary)',
    lineHeight: 1.6,
    overflowWrap: 'anywhere',
  },
  checkValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    whiteSpace: 'nowrap',
  },
  linesRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
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
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--border-color)',
  },
  footerText: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-muted)',
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
