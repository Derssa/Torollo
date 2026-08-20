import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from './Button';
import { setTelemetryConsent } from '../../features/telemetry/consent';
import { useTelemetryConsent } from '../../features/telemetry/useTelemetryConsent';

/**
 * The revocation path the README points at: telemetry stays reversible after
 * the one-time consent card is gone. `unset` toggles to accepted — it already
 * behaves as declined on the wire.
 */
export default function TelemetryToggle() {
  const { t } = useTranslation();
  const consent = useTelemetryConsent();
  const enabled = consent === 'accepted';
  const label = enabled ? t('telemetry.toggleOn') : t('telemetry.toggleOff');

  return (
    <Button
      size="lg"
      onClick={() => setTelemetryConsent(enabled ? 'declined' : 'accepted')}
      title={label}
      aria-label={label}
      aria-pressed={enabled}
    >
      <Activity size={15} style={enabled ? undefined : { opacity: 0.45 }} />
    </Button>
  );
}
