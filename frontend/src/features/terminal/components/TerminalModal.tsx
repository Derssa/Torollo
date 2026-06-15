import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { io, Socket } from 'socket.io-client';
import { X, Terminal as TermIcon } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface TerminalModalProps {
  containerId: string;
  nodeName: string;
  onClose: () => void;
}

export default function TerminalModal({ containerId, nodeName, onClose }: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const socket = io('http://localhost:5000');
    socketRef.current = socket;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#0B0F19',
        foreground: '#F3F4F6',
        cursor: '#3B82F6',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
      },
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 14,
    });
    termRef.current = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    if (terminalRef.current) {
      term.open(terminalRef.current);
      fitAddon.fit();
    }

    socket.emit('join-terminal', { containerId });

    socket.on('terminal-output', (data: string) => {
      term.write(data);
    });

    term.onData((data) => {
      socket.emit('terminal-input', data);
    });

    const handleResize = () => {
      fitAddon.fit();
      socket.emit('terminal-resize', {
        cols: term.cols,
        rows: term.rows,
      });
    };

    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.disconnect();
      term.dispose();
    };
  }, [containerId]);

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.title}>
            <TermIcon size={18} color="#3B82F6" style={{ marginRight: 8 }} />
            <span>Terminal: {nodeName}</span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>
        <div ref={terminalRef} style={styles.terminalContainer} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box',
  },
  container: {
    width: '900px',
    maxWidth: '100%',
    height: '600px',
    maxHeight: '100%',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    fontWeight: 600,
    fontSize: '14px',
    color: '#F3F4F6',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  terminalContainer: {
    flex: 1,
    backgroundColor: '#0B0F19',
    position: 'relative',
    overflow: 'hidden',
  },
};
