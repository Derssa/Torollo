import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, X } from 'lucide-react';
import { stepOutcome, isDockerUnavailable } from '../validationStatus';
import type { StepValidationResponse } from '../../../shared/types/roadmap';

interface ValidationToastProps {
  response: StepValidationResponse;
  isLastStep: boolean;
  onDismiss: () => void;
}

/**
 * The verdict of a validation attempt, floated over the canvas rather than
 * stacked in the sidebar: the learner's eyes are on their architecture when
 * they hit Validate, so the answer appears where they are looking. Kept to
 * one verdict and a single detail line — the full instruction, hints and
 * navigation live in the sidebar, the toast only answers "did it work?".
 */
export default function ValidationToast({
  response,
  isLastStep,
  onDismiss,
}: ValidationToastProps) {
  const { t } = useTranslation();
  const outcome = stepOutcome(response);

  const failedChecks = response.results.filter(result => result.status !== 'pass');

  let disc: React.CSSProperties;
  let DiscIcon: typeof Check;
  let title: string;
  let titleColor: string;
  let detail: string | undefined;
  let remainingChecks = 0;

  if (outcome === 'passed') {
    disc = { backgroundColor: 'var(--color-success)' };
    DiscIcon = Check;
    title = isLastStep ? t('learning.player.roadmapComplete') : t('learning.player.stepPassed');
    titleColor = 'var(--color-success)';
    detail = response.results[0]?.message;
  } else if (outcome === 'error') {
    disc = { backgroundColor: 'var(--color-warning)' };
    DiscIcon = AlertTriangle;
    title = t('learning.player.checksBlocked');
    titleColor = 'var(--color-warning-strong)';
    detail = isDockerUnavailable(response)
      ? t('learning.player.stepErrorDocker')
      : t('learning.player.stepError');
  } else {
    disc = { backgroundColor: 'var(--color-danger)' };
    DiscIcon = X;
    title = t('learning.player.stepFailed');
    titleColor = 'var(--color-danger)';
    detail = failedChecks[0]?.message;
    remainingChecks = failedChecks.length - 1;
  }

  return createPortal(
    <div style={styles.toast} role="status">
      <span style={{ ...styles.disc, ...disc }}>
        <DiscIcon size={13} color="var(--color-on-accent)" strokeWidth={3} />
      </span>
      <div style={styles.body}>
        <span style={{ ...styles.title, color: titleColor }}>{title}</span>
        {detail && <span style={styles.detail}>{detail}</span>}
        {remainingChecks > 0 && (
          <span style={styles.moreChecks}>
            {t('learning.player.moreChecks', { count: remainingChecks })}
          </span>
        )}
      </div>
      <button
        onClick={onDismiss}
        style={styles.dismissBtn}
        aria-label={t('learning.player.dismissNotice')}
      >
        <X size={14} />
      </button>
    </div>,
    document.body
  );
}

const styles: Record<string, React.CSSProperties> = {
  toast: {
    position: 'fixed',
    bottom: '64px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 60,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    minWidth: '340px',
    maxWidth: '480px',
    padding: '12px 14px',
    backgroundColor: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    boxShadow: 'var(--shadow-floating)',
  },
  disc: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: '13px',
    fontWeight: 700,
    lineHeight: '22px',
  },
  detail: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  moreChecks: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
  },
  dismissBtn: {
    display: 'flex',
    padding: '4px',
    marginTop: '-2px',
    marginRight: '-4px',
    border: 'none',
    background: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    flexShrink: 0,
  },
};
