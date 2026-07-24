import { useTranslation } from 'react-i18next';
import { Play, RotateCcw } from 'lucide-react';
import Button from '../../../../../shared/components/Button';
import type { DockerHealth } from '../../../../../shared/hooks/useDockerHealth';

interface LaunchFooterProps {
  /** Resume position, when the roadmap has been played; absent on a fresh start. */
  resume?: { current: number; total: number; projectName: string };
  docker: DockerHealth;
  onRecheckDocker: () => void;
  onLaunch: () => void;
  /** Absent when there is no progress to clear. */
  onRestart?: () => void;
  /** Server-provided message of a failed restart, or '' for a generic failure. */
  restartError?: string | null;
}

/**
 * The page's commitment point. Docker readiness is stated here rather than
 * after the first failure, but never blocks the launch: the probe can be
 * momentarily wrong, and the canvas surfaces daemon problems on its own.
 */
export default function LaunchFooter({
  resume,
  docker,
  onRecheckDocker,
  onLaunch,
  onRestart,
  restartError,
}: LaunchFooterProps) {
  const { t } = useTranslation();

  return (
    <div style={styles.footer}>
      {restartError != null && (
        <span style={styles.error}>{restartError || t('learning.detail.launch.restartError')}</span>
      )}

      <div style={styles.actions}>
        {onRestart && (
          <Button size="lg" onClick={onRestart}>
            <RotateCcw size={15} />
            {t('learning.detail.launch.restart')}
          </Button>
        )}
        <Button variant="primary" size="lg" onClick={onLaunch}>
          <Play size={16} />
          {resume
            ? t('learning.detail.launch.continue', { current: resume.current, total: resume.total })
            : t('learning.detail.launch.start')}
        </Button>
      </div>

      <p style={styles.caption}>
        {resume
          ? t('learning.detail.launch.continueCaption', { project: resume.projectName })
          : t('learning.detail.launch.startCaption')}
      </p>

      {docker !== 'unknown' && (
        <p style={styles.docker}>
          <span
            style={{
              ...styles.dot,
              background: docker === 'ok' ? 'var(--color-success)' : 'var(--color-warning)',
            }}
            aria-hidden
          />
          <span style={docker === 'ok' ? styles.dockerOk : styles.dockerDown}>
            {docker === 'ok' ? t('learning.detail.launch.dockerOk') : t('learning.detail.launch.dockerDown')}
          </span>
          {docker === 'down' && (
            <button type="button" onClick={onRecheckDocker} style={styles.recheck}>
              {t('learning.detail.launch.dockerRetry')}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  footer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 'var(--space-2)',
  },
  actions: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  caption: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-muted)',
    margin: 0,
    textAlign: 'right',
  },
  docker: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    fontSize: 'var(--text-sm)',
    margin: 0,
  },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  dockerOk: {
    color: 'var(--color-text-secondary)',
  },
  dockerDown: {
    color: 'var(--color-warning-strong)',
  },
  recheck: {
    background: 'none',
    border: 'none',
    padding: 'var(--space-1)',
    color: 'var(--color-accent)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
  },
  error: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-danger)',
    textAlign: 'right',
  },
};
