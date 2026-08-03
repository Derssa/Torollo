import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Key, BookOpen, Terminal, RefreshCw, AlertCircle, Eye, Loader2, Server } from 'lucide-react';
import { API_BASE } from '../../../shared/types';
import InspectorModal, { TabPanel } from '../components/InspectorModal';
import CheatSheetTab from '../components/CheatSheetTab';
import QueryShellTab from '../components/QueryShellTab';
import { useExplorerData } from '../components/useExplorerData';
import { inspectorStyles } from '../components/inspectorStyles';
import redisCheatSheet from './data/redisCheatSheet.json';

interface RedisModalProps {
  containerId: string;
  nodeName: string;
  projectId: string;
  onClose: () => void;
}

interface RedisKey {
  key: string;
  type: string;
}

const REDIS_IMAGE = 'redis:7-alpine';

/** Maps a Redis value type to the read command that displays its content. */
function readCommandForType(type: string, key: string): string {
  switch (type) {
    case 'list':
      return `LRANGE ${key} 0 -1`;
    case 'hash':
      return `HGETALL ${key}`;
    case 'set':
      return `SMEMBERS ${key}`;
    case 'zset':
      return `ZRANGE ${key} 0 -1 WITHSCORES`;
    case 'stream':
      return `XRANGE ${key} - +`;
    default:
      return `GET ${key}`;
  }
}

export default function RedisModal({ containerId, nodeName, projectId, onClose }: RedisModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('details');

  const {
    data: explorerData,
    loading: loadingExplorer,
    error: explorerError,
    refetch: fetchExplorerData,
  } = useExplorerData<RedisKey>(
    `${API_BASE}/api/projects/${projectId}/containers/${containerId}/redis/explorer`,
    'Failed to inspect keys'
  );

  // Shell states
  const [command, setCommand] = useState('KEYS *');
  const [queryOutput, setQueryOutput] = useState('');
  const [executing, setExecuting] = useState(false);

  const runCommand = async (commandToRun: string) => {
    if (!commandToRun.trim()) {
      setQueryOutput('No command to run.');
      return;
    }
    try {
      setExecuting(true);
      setQueryOutput('Executing command in container...');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/redis/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: commandToRun })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(data.result || 'Command executed successfully with no output.');
        fetchExplorerData();
      } else {
        setQueryOutput(`ERROR: ${data.error}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setQueryOutput(`Execution failed: ${errMsg}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleViewValue = (entry: RedisKey) => {
    const readCommand = readCommandForType(entry.type, entry.key);
    setCommand(readCommand);
    setActiveTab('shell');
    runCommand(readCommand);
  };

  const tabs = [
    { id: 'details', label: t('redis.tabs.details'), icon: <Server size={15} style={{ marginRight: 6 }} /> },
    { id: 'explorer', label: t('redis.tabs.explorer'), icon: <Database size={15} style={{ marginRight: 6 }} /> },
    { id: 'shell', label: t('redis.tabs.shell'), icon: <Terminal size={15} style={{ marginRight: 6 }} /> },
    { id: 'cheatsheet', label: t('redis.tabs.cheatsheet'), icon: <BookOpen size={15} style={{ marginRight: 6 }} /> },
  ];

  return (
    <InspectorModal tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} onClose={onClose}>
      <TabPanel visible={activeTab === 'details'}>
        <div style={inspectorStyles.tabContent}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: 'var(--neutral-800)' }}>{t('redis.details.title')}</h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--neutral-500)' }}>
            {t('redis.details.desc')}
          </p>

          <div style={{ border: '1px solid var(--neutral-200)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>{t('redis.details.imageLabel')}</span>
              <span style={styles.detailValue}>{REDIS_IMAGE}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>{t('redis.details.portLabel')}</span>
              <span style={styles.detailValue}>6379</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Node</span>
              <span style={styles.detailValue}>{nodeName}</span>
            </div>
          </div>
        </div>
      </TabPanel>

      <TabPanel visible={activeTab === 'explorer'}>
        <div style={inspectorStyles.tabContent}>
          <div style={inspectorStyles.sectionHeader}>
            <span style={inspectorStyles.sectionTitle}>{t('redis.explorer.title')}{nodeName}</span>
            <button onClick={fetchExplorerData} disabled={loadingExplorer} style={inspectorStyles.iconActionBtn}>
              <RefreshCw size={14} className={loadingExplorer ? 'spin' : ''} />
            </button>
          </div>

          <div style={inspectorStyles.explorerTree}>
            {explorerError ? (
              explorerError === 'starting_up' ? (
                <div style={inspectorStyles.errorContainer}>
                  <Loader2 size={24} className="spin" color="var(--color-accent)" style={{ marginBottom: 12 }} />
                  <span style={inspectorStyles.errorMessage}>{t('redis.explorer.initializing')}</span>
                </div>
              ) : (
                <div style={inspectorStyles.errorContainer}>
                  <AlertCircle size={24} color="var(--color-danger)" style={{ marginBottom: 12 }} />
                  <span style={inspectorStyles.errorMessage}>{explorerError}</span>
                  <button onClick={fetchExplorerData} style={inspectorStyles.retryBtn}>
                    <RefreshCw size={12} style={{ marginRight: 6 }} />
                    {t('redis.explorer.retryBtn')}
                  </button>
                </div>
              )
            ) : explorerData.length > 0 ? (
              explorerData.map(entry => (
                <div key={entry.key} style={inspectorStyles.treeNode}>
                  <div style={inspectorStyles.treeRow}>
                    <Key size={14} color="var(--color-danger)" style={{ marginRight: 8 }} />
                    <span style={styles.keyName}>{entry.key}</span>
                    <span style={styles.keyType}>{entry.type}</span>

                    <button
                      onClick={() => handleViewValue(entry)}
                      style={inspectorStyles.inlineViewBtn}
                      title="View value in Redis shell"
                      className="glass"
                    >
                      <Eye size={12} style={{ marginRight: 4 }} />
                      {t('redis.explorer.viewDataBtn')}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div style={inspectorStyles.treeRowEmpty}>{t('redis.explorer.noKeys')}</div>
            )}
          </div>
        </div>
      </TabPanel>

      <TabPanel visible={activeTab === 'shell'}>
        <QueryShellTab
          promptLabel="redis-cli"
          value={command}
          onChange={setCommand}
          onExecute={() => runCommand(command)}
          executing={executing}
          output={queryOutput}
          labels={{
            placeholder: t('redis.shell.placeholder'),
            execute: t('redis.shell.executeBtn'),
            executing: t('redis.shell.executingBtn'),
            consoleTitle: t('redis.shell.consoleTitle'),
            emptyOutput: t('redis.shell.emptyOutput'),
          }}
        />
      </TabPanel>

      <TabPanel visible={activeTab === 'cheatsheet'}>
        <CheatSheetTab entries={redisCheatSheet} searchPlaceholder={t('redis.cheatsheet.placeholder')} />
      </TabPanel>
    </InspectorModal>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  keyName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-mono)',
  },
  keyType: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
    marginLeft: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
};
