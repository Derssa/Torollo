import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';

interface InputModalProps {
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  submitText?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export default function InputModal({
  title,
  label,
  placeholder = '',
  defaultValue = '',
  submitText = 'Create',
  onSubmit,
  onCancel,
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus with slight delay for animation
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <Modal onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <h3 style={styles.title}>{title}</h3>
        {label && <p style={styles.label}>{label}</p>}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          style={styles.input}
          id="modal-input"
        />
        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.cancelBtn}>
            Cancel
          </button>
          <button type="submit" disabled={!value.trim()} style={{
            ...styles.submitBtn,
            opacity: value.trim() ? 1 : 0.5,
          }}>
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    margin: '0 0 4px 0',
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.3px',
  },
  label: {
    margin: '0 0 16px 0',
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: '14px',
    fontFamily: 'var(--font-sans)',
    border: '1px solid rgba(0, 0, 0, 0.12)',
    borderRadius: '10px',
    outline: 'none',
    background: 'rgba(0, 0, 0, 0.03)',
    color: 'var(--color-text-primary)',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px',
  },
  cancelBtn: {
    padding: '8px 18px',
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
  submitBtn: {
    padding: '8px 22px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    borderRadius: '10px',
    border: 'none',
    background: 'var(--color-accent)',
    color: '#FFF',
    cursor: 'pointer',
    transition: 'opacity 0.15s, transform 0.1s',
  },
};
