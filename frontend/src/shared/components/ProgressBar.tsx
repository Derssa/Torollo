interface ProgressBarProps {
  value: number;
  max: number;
  tone?: 'accent' | 'success';
  ariaLabel: string;
}

/** Thin determinate progress bar (DESIGN §4.4) — 4px track, semantic fill. */
export default function ProgressBar({ value, max, tone = 'accent', ariaLabel }: ProgressBarProps) {
  const safeMax = Math.max(1, max);
  const clamped = Math.min(Math.max(0, value), safeMax);
  const color = tone === 'success' ? 'var(--color-success)' : 'var(--color-accent)';
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      style={styles.track}
    >
      <div style={{ ...styles.fill, width: `${(clamped / safeMax) * 100}%`, background: color }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  track: {
    height: '4px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-main)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 'var(--radius-sm)',
    transition: 'width 0.2s ease-out',
  },
};
