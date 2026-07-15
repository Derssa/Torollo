import { useTranslation } from 'react-i18next';
import type { StepValidationResponse, ValidatorResult } from '../../../shared/types/roadmap';

interface StepValidationResultsProps {
  response: StepValidationResponse;
}

// P-1 scope: a deliberately raw rendering of the engine's report.
// P-2 turns this into the real ✓/✗/⚠ pedagogical feedback.
export default function StepValidationResults({ response }: StepValidationResultsProps) {
  const { t } = useTranslation();

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.banner,
          color: response.stepPassed ? 'var(--color-success)' : 'var(--color-danger)',
        }}
      >
        {response.stepPassed ? t('learning.player.stepPassed') : t('learning.player.stepFailed')}
      </div>
      {response.results.map(result => (
        <ResultBlock key={result.index} result={result} />
      ))}
    </div>
  );
}

function ResultBlock({ result }: { result: ValidatorResult }) {
  const { t } = useTranslation();
  const statusColor =
    result.status === 'pass'
      ? 'var(--color-success)'
      : result.status === 'fail'
        ? 'var(--color-danger)'
        : 'var(--color-text-muted)';

  return (
    <div style={styles.result}>
      <div style={styles.resultHeader}>
        <span style={{ ...styles.resultStatus, color: statusColor }}>[{result.status}]</span>
        <span style={styles.resultType}>{result.type}</span>
        {result.errorCode && <span style={styles.errorCode}>{result.errorCode}</span>}
      </div>
      <div style={styles.resultMessage}>{result.message}</div>
      {result.expected && (
        <div style={styles.detailLine}>
          <span style={styles.detailLabel}>{t('learning.player.expected')}:</span> {result.expected}
        </div>
      )}
      {result.observed && (
        <div style={styles.detailLine}>
          <span style={styles.detailLabel}>{t('learning.player.observed')}:</span> {result.observed}
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
    fontSize: '13px',
    fontWeight: 700,
  },
  result: {
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  resultHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
  },
  resultStatus: {
    fontWeight: 700,
  },
  resultType: {
    color: 'var(--color-text-secondary)',
  },
  errorCode: {
    color: 'var(--color-text-muted)',
    marginLeft: 'auto',
  },
  resultMessage: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    lineHeight: 1.5,
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
};
