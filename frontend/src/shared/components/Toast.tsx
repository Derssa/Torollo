import { useState, useCallback } from 'react';
import Modal from './Modal';
import { CheckCircle } from 'lucide-react';

interface ToastNotificationProps {
  message: string;
  onDismiss: () => void;
}

export function ToastNotification({ message, onDismiss }: ToastNotificationProps) {
  return (
    <div style={toastStyles.wrapper}>
      <div style={toastStyles.toast}>
        <CheckCircle size={16} color="var(--color-success)" />
        <span style={toastStyles.text}>{message}</span>
        <button onClick={onDismiss} style={toastStyles.dismiss}>✕</button>
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
    background: 'rgba(255, 255, 255, 0.92)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(0, 0, 0, 0.06)',
    boxShadow: '0 8px 32px -8px rgba(0, 0, 0, 0.12)',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  text: {
    flex: 1,
  },
  dismiss: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px',
    marginLeft: '8px',
  },
};

// Hook for toast management
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string, duration = 3000) => {
    setToast(message);
    setTimeout(() => setToast(null), duration);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, showToast, dismissToast };
}

export default Modal;
