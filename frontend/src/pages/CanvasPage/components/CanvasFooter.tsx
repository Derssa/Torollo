import type { ContainerData } from '../../../shared/types';

interface CanvasFooterProps {
  containers: ContainerData[];
}

export default function CanvasFooter({ containers }: CanvasFooterProps) {
  const running = containers.filter(c => c.state === 'running').length;
  const stopped = containers.filter(c => c.state !== 'running').length;

  return (
    <div style={styles.footer} className="glass">
      <div style={styles.statusSummary}>
        <span>Active: <strong>{running}</strong></span>
        <span style={styles.divider}>|</span>
        <span>Stopped: <strong>{stopped}</strong></span>
      </div>
      <div style={styles.footerNote}>
        Local-first Docker runtime powered by Node.js & Dockerode
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 24px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    borderTop: '1px solid var(--border-color)',
  },
  statusSummary: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-text-secondary)',
  },
  divider: {
    margin: '0 12px',
    color: 'var(--border-color-hover)',
  },
  footerNote: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
};
