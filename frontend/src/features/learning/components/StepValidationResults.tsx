import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { stepOutcome, isDockerUnavailable, STATUS_PRESETS } from '../validationStatus';
import type { StepValidationResponse, ValidatorResult } from '../../../shared/types/roadmap';

interface StepValidationResultsProps {
  response: StepValidationResponse;
  isLastStep: boolean;
  onNextStep: () => void;
}

export default function StepValidationResults({
  response,
  isLastStep,
  onNextStep,
}: StepValidationResultsProps) {
  return (
    <div style={styles.container}>
      <OutcomeBanner response={response} isLastStep={isLastStep} onNextStep={onNextStep} />
      {response.results.map(result => (
        <ValidatorResultCard key={result.index} result={result} />
      ))}
    </div>
  );
}

function OutcomeBanner({ response, isLastStep, onNextStep }: StepValidationResultsProps) {
  const { t } = useTranslation();
  const outcome = stepOutcome(response);

  if (outcome === 'passed') {
    return (
      <div style={{ ...styles.banner, ...styles.bannerPassed }}>
        <div style={styles.bannerHeader}>
          <CheckCircle2 size={15} style={styles.bannerIcon} color="var(--color-success)" />
          <span style={{ color: 'var(--color-success)' }}>
            {isLastStep ? t('learning.player.roadmapComplete') : t('learning.player.stepPassed')}
          </span>
        </div>
        {!isLastStep && (
          <button onClick={onNextStep} style={styles.nextStepBtn}>
            {t('learning.player.nextStep')}
          </button>
        )}
      </div>
    );
  }

  if (outcome === 'error') {
    const dockerDown = isDockerUnavailable(response);
    return (
      <div style={{ ...styles.banner, ...styles.bannerError }}>
        <div style={styles.bannerHeader}>
          <AlertTriangle size={15} style={styles.bannerIcon} color="var(--color-warning)" />
          <span style={{ color: 'var(--color-warning-strong)' }}>
            {dockerDown ? t('learning.player.stepErrorDocker') : t('learning.player.stepError')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.banner, ...styles.bannerFailed }}>
      <div style={styles.bannerHeader}>
        <XCircle size={15} style={styles.bannerIcon} color="var(--color-danger)" />
        <span style={{ color: 'var(--color-danger)' }}>{t('learning.player.stepFailed')}</span>
      </div>
    </div>
  );
}

function ValidatorResultCard({ result }: { result: ValidatorResult }) {
  const { t } = useTranslation();
  const { icon: Icon, color, labelKey } = STATUS_PRESETS[result.status];

  return (
    <div style={{ ...styles.card, borderLeft: `3px solid ${color}` }}>
      <div style={styles.cardHeader}>
        <Icon size={14} color={color} style={styles.cardIcon} role="img" aria-label={t(labelKey)} />
        <span style={styles.cardMessage}>{result.message}</span>
      </div>
      {result.status === 'error' && (
        <span style={styles.checkNotRun}>{t('learning.player.checkNotRun')}</span>
      )}
      {result.expected != null && (
        <div style={styles.detailLine}>
          <span style={styles.detailLabel}>{t('learning.player.expected')}:</span>{' '}
          <span style={styles.detailValue}>{result.expected}</span>
        </div>
      )}
      {result.observed != null && (
        <div style={styles.detailLine}>
          <span style={styles.detailLabel}>{t('learning.player.observed')}:</span>{' '}
          <span style={styles.detailValue}>{result.observed}</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  banner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 700,
    lineHeight: 1.5,
  },
  bannerPassed: {
    border: '1px solid var(--color-success)',
    backgroundColor: 'var(--color-success-glow)',
  },
  bannerFailed: {
    border: '1px solid var(--color-danger)',
    backgroundColor: 'var(--color-danger-glow)',
  },
  bannerError: {
    border: '1px solid var(--color-warning)',
    backgroundColor: 'var(--color-warning-glow)',
  },
  bannerHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
  },
  bannerIcon: {
    flexShrink: 0,
    marginTop: '2px',
  },
  nextStepBtn: {
    alignSelf: 'flex-start',
    padding: '6px 14px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'var(--color-success)',
    color: 'var(--color-white)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  card: {
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
  },
  cardIcon: {
    flexShrink: 0,
    marginTop: '2px',
  },
  cardMessage: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    lineHeight: 1.5,
  },
  checkNotRun: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-warning-strong)',
  },
  detailLine: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.4,
  },
  detailLabel: {
    fontWeight: 600,
    color: 'var(--color-text-muted)',
  },
  detailValue: {
    fontFamily: 'var(--font-mono)',
  },
};
