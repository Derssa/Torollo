import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Server, BookOpen, Search, Copy, Check, ExternalLink, AlertCircle, HelpCircle } from 'lucide-react';
import rabbitmqCheatSheet from './data/rabbitmqCheatSheet.json';

interface RabbitMqModalProps {
  nodeName: string;
  port?: string;
  ipAddress?: string;
  state: string;
  onClose: () => void;
}

const CHEAT_SHEET_DATA = rabbitmqCheatSheet;
const RABBITMQ_IMAGE = 'derssa/backend-lab-rabbitmq:v1';

export default function RabbitMqModal({ nodeName, port, ipAddress, state, onClose }: RabbitMqModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'details' | 'cheatsheet'>('details');
  const [cheatQuery, setCheatQuery] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleCopyCheat = (code: string, idx: number) => {
    navigator.clipboard?.writeText(code)
      .then(() => {
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2000);
      })
      .catch(() => { /* clipboard unavailable */ });
  };

  const filteredCheatSheet = CHEAT_SHEET_DATA.filter(item => {
    const query = cheatQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    );
  });

  const isRunning = state === 'running';
  // Dynamic host port mapped to RabbitMQ 15672/tcp management console
  const managementConsoleUrl = port ? `http://localhost:${port}` : '';

  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        {/* Header Tabs */}
        <div style={styles.header}>
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'details' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('details')}
            >
              <Server size={15} style={{ marginRight: 6 }} />
              {t('rabbitmq.tabs.details')}
            </button>
            <button
              style={{ ...styles.tabBtn, ...(activeTab === 'cheatsheet' ? styles.activeTabBtn : {}) }}
              onClick={() => setActiveTab('cheatsheet')}
            >
              <BookOpen size={15} style={{ marginRight: 6 }} />
              {t('rabbitmq.tabs.cheatsheet')}
            </button>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={styles.body}>
          {/* TAB: Details */}
          {activeTab === 'details' && (
            <div style={styles.tabContent}>
              <h3 style={styles.title}>{t('rabbitmq.details.title')}</h3>
              <p style={styles.desc}>{t('rabbitmq.details.desc')}</p>

              <div style={styles.infoCard}>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>{t('rabbitmq.details.stateLabel')}</span>
                  <span style={{
                    ...styles.detailValue,
                    color: isRunning ? 'var(--color-success)' : 'var(--color-danger)',
                    fontWeight: 700
                  }}>
                    {isRunning ? t('rabbitmq.details.running') : t('rabbitmq.details.stopped')}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>{t('rabbitmq.details.imageLabel')}</span>
                  <span style={styles.detailValue}>{RABBITMQ_IMAGE}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>{t('rabbitmq.details.nodeNameLabel')}</span>
                  <span style={styles.detailValue}>{nodeName}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>{t('rabbitmq.details.internalIpLabel')}</span>
                  <span style={styles.detailValue}>{ipAddress || t('rabbitmq.details.notAssigned')}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>{t('rabbitmq.details.amqpPortLabel')}</span>
                  <span style={styles.detailValue}>5672</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>{t('rabbitmq.details.mgmtPortLabel')}</span>
                  <span style={styles.detailValue}>15672</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>{t('rabbitmq.details.usernameLabel')}</span>
                  <span style={styles.detailValue}>guest</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>{t('rabbitmq.details.passwordLabel')}</span>
                  <span style={styles.detailValue}>guest</span>
                </div>
                {port && (
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>{t('rabbitmq.details.consoleUrlLabel')}</span>
                    <span style={styles.detailValue}>{managementConsoleUrl}</span>
                  </div>
                )}
              </div>

              {isRunning && (
                <div style={styles.warningCard}>
                  <AlertCircle size={18} color="var(--color-warning-strong)" style={{ marginRight: '10px', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '13px', color: 'var(--color-warning-strong)', lineHeight: '1.5' }}>
                    <strong>{t('rabbitmq.details.warning.title')}</strong>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                      <li>
                        {t('rabbitmq.details.warning.sgRule')}
                        <span
                          onMouseEnter={() => setShowTooltip(true)}
                          onMouseLeave={() => setShowTooltip(false)}
                          style={{ position: 'relative', cursor: 'pointer', marginLeft: '6px', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}
                        >
                          <HelpCircle size={13} color="var(--color-warning-strong)" />
                          {showTooltip && (
                            <span style={styles.tooltip}>
                              {t('rabbitmq.details.warning.tooltip')}
                            </span>
                          )}
                        </span>
                      </li>
                      <li>{t('rabbitmq.details.warning.bootDelay')}</li>
                      <li>{t('rabbitmq.details.warning.amqpRule')}</li>
                    </ul>
                  </div>
                </div>
              )}

              {isRunning && port ? (
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
                  <a
                    href={managementConsoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.actionBtn}
                  >
                    <ExternalLink size={14} style={{ marginRight: 8 }} />
                    {t('rabbitmq.details.openConsoleBtn')}
                  </a>
                </div>
              ) : (
                <div style={styles.alertCard}>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--neutral-500)', textAlign: 'center' }}>
                    {t('rabbitmq.details.startPrompt')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB: Cheat Sheet */}
          {activeTab === 'cheatsheet' && (
            <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column' }}>
              <div style={styles.searchBar}>
                <div style={styles.searchWrapper}>
                  <Search size={15} color="var(--color-text-muted)" style={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder={t('rabbitmq.cheatsheet.placeholder')}
                    value={cheatQuery}
                    onChange={(e) => setCheatQuery(e.target.value)}
                    style={styles.searchInput}
                  />
                </div>
              </div>

              <div style={styles.cheatSheetList}>
                {filteredCheatSheet.map((item, idx) => (
                  <div key={item.name} style={styles.cheatCard}>
                    <div style={styles.cheatHeader}>
                      <span style={styles.cheatName}>{item.name}</span>
                      <span style={styles.cheatCategory}>{item.category}</span>
                    </div>
                    <p style={styles.cheatDesc}>{item.description}</p>
                    <div style={styles.codeContainer}>
                      <pre style={styles.code}>
                        <code>{item.example}</code>
                      </pre>
                      <button
                        onClick={() => handleCopyCheat(item.example, idx)}
                        style={styles.copyBtn}
                      >
                        {copiedIndex === idx ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
                {filteredCheatSheet.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)' }}>
                    {t('rabbitmq.cheatsheet.noMatch')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
    padding: '12px 20px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-surface-solid)',
    borderTopLeftRadius: '12px',
    borderTopRightRadius: '12px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
  },
  tabBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  activeTabBtn: {
    backgroundColor: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s, color 0.2s',
  },
  body: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'var(--bg-surface-solid)',
  },
  tabContent: {
    height: '100%',
    overflowY: 'auto',
    padding: '20px',
    boxSizing: 'border-box',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '16px',
    color: 'var(--neutral-800)',
  },
  desc: {
    margin: '0 0 20px 0',
    fontSize: '13px',
    color: 'var(--neutral-500)',
  },
  infoCard: {
    border: '1px solid var(--neutral-200)',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    backgroundColor: 'var(--neutral-50)'
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
  },
  detailLabel: {
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
  },
  detailValue: {
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-mono)',
  },
  actionBtn: {
    backgroundColor: 'var(--color-orange)',
    color: 'var(--color-white)',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
    boxShadow: '0 4px 6px -1px color-mix(in srgb, var(--color-orange) 20%, transparent), 0 2px 4px -1px color-mix(in srgb, var(--color-orange) 10%, transparent)',
    transition: 'background-color 0.2s, transform 0.2s',
  },
  alertCard: {
    border: '1px dashed var(--neutral-200)',
    borderRadius: '8px',
    padding: '20px',
    marginTop: '24px',
    backgroundColor: 'var(--neutral-50)'
  },
  searchBar: {
    marginBottom: '16px',
  },
  searchWrapper: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    padding: '6px 10px',
  },
  searchIcon: {
    marginRight: '6px',
  },
  searchInput: {
    border: 'none',
    background: 'transparent',
    outline: 'none',
    fontSize: '12px',
    width: '100%',
    color: 'var(--color-text-primary)',
  },
  cheatSheetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto',
    flex: 1,
  },
  cheatCard: {
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '16px',
    backgroundColor: 'var(--bg-surface-solid)',
  },
  cheatHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  cheatName: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-orange)',
  },
  cheatCategory: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border-color)',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  cheatDesc: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    margin: '0 0 12px 0',
  },
  codeContainer: {
    position: 'relative',
  },
  code: {
    margin: 0,
    padding: '10px 14px',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    borderRadius: '6px',
    overflowX: 'auto',
    border: '1px solid var(--border-color)',
  },
  copyBtn: {
    position: 'absolute',
    right: '8px',
    top: '8px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-muted)',
    padding: '4px',
    borderRadius: '4px',
  },
  warningCard: {
    border: '1px solid var(--color-warning-border)',
    borderRadius: '8px',
    padding: '12px 16px',
    marginTop: '16px',
    backgroundColor: 'var(--color-warning-subtle)',
    display: 'flex',
    alignItems: 'flex-start',
  },
  tooltip: {
    position: 'absolute',
    bottom: '135%',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'var(--neutral-800)',
    color: 'var(--color-white)',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '11px',
    width: '200px',
    textAlign: 'center',
    zIndex: 10,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    pointerEvents: 'none',
    lineHeight: '1.4',
    fontWeight: 500,
  }
};
