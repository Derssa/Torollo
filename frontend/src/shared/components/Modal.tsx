import { useEffect, useRef } from 'react';

interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
  width?: string;
}

export default function Modal({ children, onClose, width = '440px' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => {
      if (overlayRef.current) overlayRef.current.style.opacity = '1';
      if (panelRef.current) {
        panelRef.current.style.opacity = '1';
        panelRef.current.style.transform = 'scale(1) translateY(0)';
      }
    });

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} style={styles.overlay}>
      <div ref={panelRef} style={{ ...styles.panel, width }}>
        {children}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0,
    transition: 'opacity 0.2s ease-out',
  },
  panel: {
    background: 'rgba(255, 255, 255, 0.92)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderRadius: '16px',
    border: '1px solid rgba(0, 0, 0, 0.06)',
    boxShadow:
      '0 24px 48px -12px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.03)',
    padding: '28px',
    opacity: 0,
    transform: 'scale(0.96) translateY(8px)',
    transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
    maxWidth: '90vw',
    maxHeight: '85vh',
    overflow: 'auto',
  },
};
