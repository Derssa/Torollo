import { useTranslation } from 'react-i18next';
import Button from '../../../shared/components/Button';
import { setTelemetryConsent } from '../../../features/telemetry/consent';
import { useTelemetryConsent } from '../../../features/telemetry/useTelemetryConsent';

/**
 * The opt-in prompt, asked once on the home shell (the first-run surface)
 * instead of a blocking modal. It only exists while the choice is unanswered;
 * either answer is reversible later through the header toggle.
 */
export default function TelemetryConsentCard() {
  const { t } = useTranslation();
  const consent = useTelemetryConsent();
  if (consent !== 'unset') return null;

  return (
    <div style={styles.card} role="region" aria-label={t('telemetry.title')}>
      <div style={styles.copy}>
        <div style={styles.title}>{t('telemetry.title')}</div>
        <p style={styles.body}>{t('telemetry.body')}</p>
      </div>
      <div style={styles.actions}>
        <Button onClick={() => setTelemetryConsent('accepted')}>{t('telemetry.accept')}</Button>
        <Button onClick={() => setTelemetryConsent('declined')}>{t('telemetry.decline')}</Button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-6)',
    flexWrap: 'wrap',
    padding: 'var(--space-4) var(--space-5)',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
  },
  copy: {
    flex: '1 1 380px',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },
  title: {
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  body: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    margin: 0,
  },
  actions: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },
};
