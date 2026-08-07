import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Persistent banner shown when the backend's real inter-subnet self-test
 * found that this host drops routed traffic between subnet networks: rules
 * between subnets are honored in the config but packets cannot actually
 * cross, so the user must not trust cross-subnet connections on this machine.
 */
export function InterSubnetBlockedBanner() {
  const { t } = useTranslation();
  return (
    <div style={bannerStyles.wrapper}>
      <div style={bannerStyles.banner}>
        <AlertTriangle size={16} color="var(--color-warning)" style={{ flexShrink: 0 }} />
        <span>{t('common.interSubnetBlocked')}</span>
      </div>
    </div>
  );
}

const bannerStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 3000,
  },
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 18px',
    borderRadius: '12px',
    border: '1px solid var(--color-warning)',
    background: 'var(--color-warning-surface)',
    color: 'var(--color-warning-strong)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow: 'var(--shadow-floating)',
    fontSize: '13px',
    fontWeight: 600,
    maxWidth: '640px',
  },
};
