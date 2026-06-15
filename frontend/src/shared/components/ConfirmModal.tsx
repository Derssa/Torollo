import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmText = 'Confirm',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const isDanger = variant === 'danger';

  return (
    <Modal onClose={onCancel}>
      <div style={styles.iconRow}>
        <div style={{
          ...styles.iconCircle,
          background: isDanger ? 'var(--color-danger-glow)' : 'var(--color-accent-glow)',
        }}>
          <AlertTriangle
            size={20}
            color={isDanger ? 'var(--color-danger)' : 'var(--color-accent)'}
          />
        </div>
      </div>
      <h3 style={styles.title}>{title}</h3>
      <p style={styles.message}>{message}</p>
      <div style={styles.actions}>
        <button onClick={onCancel} style={styles.cancelBtn}>Cancel</button>
        <button onClick={onConfirm} style={{
          ...styles.confirmBtn,
          background: isDanger ? 'var(--color-danger)' : 'var(--color-accent)',
        }}>
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  iconRow: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  iconCircle: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    margin: '0 0 6px 0',
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    textAlign: 'center',
    letterSpacing: '-0.3px',
  },
  message: {
    margin: '0 0 20px 0',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.6,
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
  },
  cancelBtn: {
    padding: '8px 22px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    borderRadius: '10px',
    border: '1px solid rgba(0, 0, 0, 0.1)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  confirmBtn: {
    padding: '8px 22px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    borderRadius: '10px',
    border: 'none',
    color: '#FFF',
    cursor: 'pointer',
    transition: 'opacity 0.15s, transform 0.1s',
  },
};
