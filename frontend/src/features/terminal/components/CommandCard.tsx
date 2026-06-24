import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import type { LinuxCommand } from '../hooks/useCommandSearch';

interface CommandCardProps {
  command: LinuxCommand;
}

export default function CommandCard({ command }: CommandCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(command.example);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      style={styles.card} 
      onClick={() => setExpanded(!expanded)}
    >
      <div style={styles.header}>
        <div style={styles.left}>
          <code style={styles.name}>{command.name}</code>
          <span style={styles.category}>{command.category}</span>
        </div>
        <div style={styles.right}>
          <span style={styles.desc}>{command.description}</span>
          {expanded ? <ChevronUp size={16} color="var(--color-text-muted)" /> : <ChevronDown size={16} color="var(--color-text-muted)" />}
        </div>
      </div>

      {expanded && (
        <div style={styles.details} onClick={e => e.stopPropagation()}>
          <div style={styles.exampleHeader}>
            <span style={styles.exampleTitle}>{t('terminal.cheatsheet.example')}</span>
            <button style={styles.copyBtn} onClick={handleCopy}>
              {copied ? (
                <>
                  <Check size={13} color="#10B981" style={{ marginRight: 4 }} />
                  <span style={{ color: '#10B981' }}>{t('terminal.cheatsheet.copied')}</span>
                </>
              ) : (
                <>
                  <Copy size={13} style={{ marginRight: 4 }} />
                  <span>{t('terminal.cheatsheet.copy')}</span>
                </>
              )}
            </button>
          </div>
          <pre style={styles.codeBlock}>
            <code>{command.example}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '10px',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  name: {
    fontFamily: 'JetBrains Mono, monospace',
    fontWeight: 700,
    fontSize: '14px',
    color: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-glow)',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  category: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border-color)',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    justifyContent: 'space-between',
    minWidth: '240px',
  },
  desc: {
    fontSize: '13px',
    color: 'var(--color-text-primary)',
    lineHeight: '1.4',
  },
  details: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid var(--border-color)',
  },
  exampleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  exampleTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
  },
  copyBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    padding: '4px 6px',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  codeBlock: {
    margin: 0,
    padding: '10px 14px',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-mono)',
    borderRadius: '6px',
    overflowX: 'auto',
    border: '1px solid var(--border-color)',
  },
};
