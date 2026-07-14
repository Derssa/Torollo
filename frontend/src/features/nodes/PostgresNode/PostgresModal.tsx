import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, BookOpen, Terminal, Settings, Activity } from 'lucide-react';
import { API_BASE } from '../../../shared/types';
import InspectorModal, { TabPanel } from '../components/InspectorModal';
import CheatSheetTab from '../components/CheatSheetTab';
import QueryShellTab from '../components/QueryShellTab';
import SchemaTreeExplorer from '../components/SchemaTreeExplorer';
import type { DBNode } from '../components/SchemaTreeExplorer';
import ResourceLimitsPanel from '../components/ResourceLimitsPanel';
import { useExplorerData } from '../components/useExplorerData';
import { inspectorStyles } from '../components/inspectorStyles';
import PostgresSimulationTab from './PostgresSimulationTab';
import type { PostgresSimLog } from './PostgresSimulationTab';
import postgresCheatSheet from './data/postgresCheatSheet.json';

interface PostgresModalProps {
  containerId: string;
  nodeName: string;
  projectId: string;
  onClose: () => void;
}

export default function PostgresModal({ containerId, nodeName, projectId, onClose }: PostgresModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('details');

  const {
    data: explorerData,
    loading: loadingExplorer,
    error: explorerError,
    refetch: fetchExplorerData,
  } = useExplorerData<DBNode>(
    `${API_BASE}/api/projects/${projectId}/containers/${containerId}/postgres/explorer`,
    'Failed to inspect schema'
  );

  // Shell states
  const [selectedDb, setSelectedDb] = useState('postgres');
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM pg_tables WHERE schemaname = \'public\';');
  const [queryOutput, setQueryOutput] = useState('');
  const [executing, setExecuting] = useState(false);

  // Scaling topology shared between the details tab (counters) and the
  // simulation tab (topology map, failover promotes a replica).
  const [replicas, setReplicas] = useState(1);
  const [partitions, setPartitions] = useState(2);
  const [simLogs, setSimLogs] = useState<PostgresSimLog[]>([
    { id: '1', type: 'sys', msg: 'Primary Database initialized.', time: new Date().toLocaleTimeString() }
  ]);

  const appendSysLog = (msg: string) => {
    setSimLogs(prev => [
      { id: Math.random().toString(), type: 'sys', msg, time: new Date().toLocaleTimeString() },
      ...prev
    ]);
  };

  const handleExecuteQuery = async () => {
    let targetDb = selectedDb;
    let queryToRun = sqlQuery;
    let localConsoleOutput = '';

    const connectRegex = /^\s*\\(?:c|connect)\s+([a-zA-Z0-9_"\-]+)/m;
    const match = sqlQuery.match(connectRegex);
    if (match) {
      const dbName = match[1].replace(/"/g, '');
      targetDb = dbName;
      setSelectedDb(dbName);
      queryToRun = sqlQuery.replace(connectRegex, '').trim();
      localConsoleOutput = `Switched database connection context to "${dbName}".\n`;
    }

    if (!queryToRun) {
      setQueryOutput(`${localConsoleOutput}No SQL statements left to run.`);
      fetchExplorerData();
      return;
    }

    try {
      setExecuting(true);
      setQueryOutput(localConsoleOutput + 'Executing query in container...');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/postgres/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryToRun, database: targetDb })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(localConsoleOutput + (data.result || 'Query executed successfully with no output.'));
        fetchExplorerData();
      } else {
        setQueryOutput(localConsoleOutput + `ERROR: ${data.error}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setQueryOutput(localConsoleOutput + `Execution failed: ${errMsg}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleViewTableData = async (database: string, tableName: string) => {
    setSelectedDb(database);
    const query = `SELECT * FROM ${tableName} LIMIT 100;`;
    setSqlQuery(query);
    setActiveTab('shell');

    try {
      setExecuting(true);
      setQueryOutput('Executing query in container...');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/postgres/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, database })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(data.result || 'Query executed successfully with no output.');
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

  const tabs = [
    { id: 'details', label: t('postgres.tabs.details'), icon: <Settings size={15} style={{ marginRight: 6 }} /> },
    { id: 'simulation', label: t('postgres.tabs.simulation'), icon: <Activity size={15} style={{ marginRight: 6 }} /> },
    { id: 'explorer', label: t('postgres.tabs.explorer'), icon: <Database size={15} style={{ marginRight: 6 }} /> },
    { id: 'shell', label: t('postgres.tabs.shell'), icon: <Terminal size={15} style={{ marginRight: 6 }} /> },
    { id: 'cheatsheet', label: t('postgres.tabs.cheatsheet'), icon: <BookOpen size={15} style={{ marginRight: 6 }} /> },
  ];

  return (
    <InspectorModal tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} onClose={onClose}>
      <TabPanel visible={activeTab === 'details'}>
        <div style={inspectorStyles.tabContent}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#1E293B' }}>{t('postgres.details.title')}</h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748B' }}>
            {t('postgres.details.desc')}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <ResourceLimitsPanel
              labels={{
                title: t('postgres.details.verticalTitle'),
                cpu: t('postgres.details.cpuLabel'),
                ram: t('postgres.details.ramLabel'),
                storage: t('postgres.details.storageLabel'),
                apply: t('postgres.details.applyBtn'),
                applying: t('postgres.details.applyingBtn'),
                sysStatus: t('postgres.details.sysStatus'),
              }}
              onScalingLog={appendSysLog}
            />

            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155' }}>{t('postgres.details.horizontalTitle')}</h4>

              <div style={{ marginBottom: '16px', display: 'flex', gap: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                    {t('postgres.details.replicaLabel')}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      onClick={() => setReplicas(prev => Math.max(0, prev - 1))}
                      style={styles.counterBtn}
                    >
                      -
                    </button>
                    <span style={styles.counterValue}>{replicas}</span>
                    <button
                      onClick={() => setReplicas(prev => Math.min(3, prev + 1))}
                      style={styles.counterBtn}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                    {t('postgres.details.partitionsLabel')}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      onClick={() => setPartitions(prev => Math.max(1, prev - 1))}
                      style={styles.counterBtn}
                    >
                      -
                    </button>
                    <span style={styles.counterValue}>{partitions}</span>
                    <button
                      onClick={() => setPartitions(prev => Math.min(5, prev + 1))}
                      style={styles.counterBtn}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '12px' }}>
                {t('postgres.details.scaleDesc')}
              </span>

              <div style={{ backgroundColor: '#F8FAFC', borderRadius: '6px', padding: '12px', borderLeft: '3px solid #2563EB' }}>
                <h5 style={{ margin: '0 0 4px 0', fontSize: '11px', textTransform: 'uppercase', color: '#475569' }}>{t('postgres.details.topologyTitle')}</h5>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  {t('postgres.details.topologyDesc')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      <TabPanel visible={activeTab === 'simulation'}>
        <PostgresSimulationTab
          visible={activeTab === 'simulation'}
          replicas={replicas}
          setReplicas={setReplicas}
          partitions={partitions}
          simLogs={simLogs}
          setSimLogs={setSimLogs}
        />
      </TabPanel>

      <TabPanel visible={activeTab === 'explorer'}>
        <SchemaTreeExplorer
          title={`${t('postgres.explorer.title')}${nodeName}`}
          data={explorerData}
          loading={loadingExplorer}
          error={explorerError}
          onRefresh={fetchExplorerData}
          onViewData={handleViewTableData}
          initialExpandedDb="postgres"
          labels={{
            initializing: t('postgres.explorer.initializing'),
            retry: t('postgres.explorer.retryBtn'),
            viewData: t('postgres.explorer.viewDataBtn'),
            viewDataTitle: 'View Table Data (SQL Shell)',
            emptyTables: t('postgres.explorer.noPublicTables'),
          }}
        />
      </TabPanel>

      <TabPanel visible={activeTab === 'shell'}>
        <QueryShellTab
          promptLabel={t('postgres.shell.targetDb')}
          headerExtra={
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              style={styles.select}
            >
              {explorerData.map(dbNode => (
                <option key={dbNode.database} value={dbNode.database}>
                  {dbNode.database}
                </option>
              ))}
            </select>
          }
          value={sqlQuery}
          onChange={setSqlQuery}
          onExecute={handleExecuteQuery}
          executing={executing}
          output={queryOutput}
          labels={{
            placeholder: t('postgres.shell.placeholder'),
            execute: t('postgres.shell.executeBtn'),
            executing: t('postgres.shell.executingBtn'),
            consoleTitle: t('postgres.shell.consoleTitle'),
            emptyOutput: t('postgres.shell.emptyOutput'),
          }}
        />
      </TabPanel>

      <TabPanel visible={activeTab === 'cheatsheet'}>
        <CheatSheetTab entries={postgresCheatSheet} searchPlaceholder={t('postgres.cheatsheet.placeholder')} />
      </TabPanel>
    </InspectorModal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  select: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    fontSize: '13px',
    backgroundColor: '#FFF',
    outline: 'none',
  },
  counterBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: '1px solid #CBD5E1',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  counterValue: {
    fontSize: '16px',
    fontWeight: 'bold',
    width: '20px',
    textAlign: 'center',
  },
};
