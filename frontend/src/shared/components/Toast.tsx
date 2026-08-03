import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface ToastNotificationProps {
  type: 'error' | 'warning' | 'success';
  message: string;
  onDismiss: () => void;
}

export function ToastNotification({ type, message, onDismiss }: ToastNotificationProps) {
  const getThemeStyles = () => {
    switch (type) {
      case 'success':
        return {
          border: '1px solid var(--color-success)',
          background: 'rgba(240, 253, 250, 0.96)',
          color: 'var(--color-success-strong)',
          iconColor: 'var(--color-success)',
          Icon: CheckCircle
        };
      case 'warning':
        return {
          border: '1px solid var(--color-warning)',
          background: 'rgba(255, 251, 235, 0.96)',
          color: 'var(--color-warning-strong)',
          iconColor: 'var(--color-warning)',
          Icon: AlertTriangle
        };
      case 'error':
      default:
        return {
          border: '1px solid var(--color-danger)',
          background: 'rgba(254, 242, 242, 0.96)',
          color: 'var(--color-danger-strong)',
          iconColor: 'var(--color-danger)',
          Icon: XCircle
        };
    }
  };

  const theme = getThemeStyles();
  const Icon = theme.Icon;

  return (
    <div style={toastStyles.wrapper}>
      <div style={{
        ...toastStyles.toast,
        border: theme.border,
        background: theme.background,
        color: theme.color,
      }}>
        <Icon size={16} color={theme.iconColor} style={{ flexShrink: 0 }} />
        <span style={toastStyles.text}>{message}</span>
        <button onClick={onDismiss} style={{
          ...toastStyles.dismiss,
          color: theme.color
        }}>✕</button>
      </div>
    </div>
  );
}

const toastStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 3000,
    animation: 'slideInRight 0.3s ease-out',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 18px',
    borderRadius: '12px',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow: '0 8px 32px -8px rgba(0, 0, 0, 0.12)',
    fontSize: '13px',
    fontWeight: 600,
  },
  text: {
    flex: 1,
  },
  dismiss: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px',
    marginLeft: '8px',
  },
};

