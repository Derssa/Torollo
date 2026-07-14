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
import NoSqlSimulationTab from './NoSqlSimulationTab';
import type { NoSqlSimLog } from './NoSqlSimulationTab';
import mongoCheatSheet from './data/mongoCheatSheet.json';

interface NoSqlModalProps {
  containerId: string;
  nodeName: string;
  projectId: string;
  onClose: () => void;
}

export default function NoSqlModal({ containerId, nodeName, projectId, onClose }: NoSqlModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('details');

  const {
    data: explorerData,
    loading: loadingExplorer,
    error: explorerError,
    refetch: fetchExplorerData,
  } = useExplorerData<DBNode>(
    `${API_BASE}/api/projects/${projectId}/containers/${containerId}/nosql/explorer`,
    'Failed to inspect schema'
  );

  // Shell states
  const [mongoQuery, setMongoQuery] = useState("db.users.insertOne({ name: 'Bob', age: 25, status: 'active' })");
  const [queryOutput, setQueryOutput] = useState('');
  const [executing, setExecuting] = useState(false);

  // Scaling topology shared between the details tab (counters) and the
  // simulation tab (hash routing over shards, replica sets).
  const [shards, setShards] = useState(2);
  const [replicas, setReplicas] = useState(1);
  const [simLogs, setSimLogs] = useState<NoSqlSimLog[]>([
    { id: '1', type: 'sys', msg: 'MongoDB Router (mongos) online. Shard servers active.', time: new Date().toLocaleTimeString() }
  ]);

  const appendSysLog = (msg: string) => {
    setSimLogs(prev => [
      { id: Math.random().toString(), type: 'sys', msg, time: new Date().toLocaleTimeString() },
      ...prev
    ]);
  };

  const handleExecuteQuery = async () => {
    try {
      setExecuting(true);
      setQueryOutput('Evaluating mongosh expression...');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/nosql/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mongoQuery })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(data.result || 'Executed successfully.');
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

  const handleViewCollectionData = async (database: string, collName: string) => {
    const query = `JSON.stringify(db.getSiblingDB('${database}').getCollection('${collName}').find().limit(10).toArray(), null, 2)`;
    setMongoQuery(query);
    setActiveTab('shell');

    try {
      setExecuting(true);
      setQueryOutput('Retrieving collection documents...');
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${containerId}/nosql/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (res.ok) {
        setQueryOutput(data.result || 'No documents.');
      } else {
        setQueryOutput(`ERROR: ${data.error}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setQueryOutput(`Error: ${errMsg}`);
    } finally {
      setExecuting(false);
    }
  };

  const tabs = [
    { id: 'details', label: t('nosql.tabs.details'), icon: <Settings size={15} style={{ marginRight: 6 }} /> },
    { id: 'simulation', label: t('nosql.tabs.simulation'), icon: <Activity size={15} style={{ marginRight: 6 }} /> },
    { id: 'explorer', label: t('nosql.tabs.explorer'), icon: <Database size={15} style={{ marginRight: 6 }} /> },
    { id: 'shell', label: t('nosql.tabs.shell'), icon: <Terminal size={15} style={{ marginRight: 6 }} /> },
    { id: 'cheatsheet', label: t('nosql.tabs.cheatsheet'), icon: <BookOpen size={15} style={{ marginRight: 6 }} /> },
  ];

  return (
    <InspectorModal tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} onClose={onClose}>
      <TabPanel visible={activeTab === 'details'}>
        <div style={inspectorStyles.tabContent}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#1E293B' }}>{t('nosql.details.title')}</h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748B' }}>
            {t('nosql.details.desc')}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <ResourceLimitsPanel
              labels={{
                title: t('nosql.details.verticalTitle'),
                cpu: t('nosql.details.cpuLabel'),
                ram: t('nosql.details.ramLabel'),
                storage: t('nosql.details.storageLabel'),
                apply: t('nosql.details.applyBtn'),
                applying: t('nosql.details.applyingBtn'),
                sysStatus: t('nosql.details.sysStatus'),
              }}
              onScalingLog={appendSysLog}
            />

            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155' }}>{t('nosql.details.horizontalTitle')}</h4>

              <div style={{ marginBottom: '16px', display: 'flex', gap: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                    {t('nosql.details.shardsLabel')}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      onClick={() => setShards(prev => Math.max(1, prev - 1))}
                      style={styles.counterBtn}
                    >
                      -
                    </button>
                    <span style={styles.counterValue}>{shards}</span>
                    <button
                      onClick={() => setShards(prev => Math.min(5, prev + 1))}
                      style={styles.counterBtn}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                    {t('nosql.details.replicaLabel')}
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
              </div>

              <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '12px' }}>
                {t('nosql.details.scaleDesc')}
              </span>

              <div style={{ backgroundColor: '#F8FAFC', borderRadius: '6px', padding: '12px', borderLeft: '3px solid #2563EB' }}>
                <h5 style={{ margin: '0 0 4px 0', fontSize: '11px', textTransform: 'uppercase', color: '#475569' }}>{t('nosql.details.topologyTitle')}</h5>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  {t('nosql.details.topologyDesc')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </TabPanel>

      <TabPanel visible={activeTab === 'simulation'}>
        <NoSqlSimulationTab
          visible={activeTab === 'simulation'}
          shards={shards}
          replicas={replicas}
          simLogs={simLogs}
          setSimLogs={setSimLogs}
        />
      </TabPanel>

      <TabPanel visible={activeTab === 'explorer'}>
        <SchemaTreeExplorer
          title={`${t('nosql.explorer.title')}${nodeName}`}
          data={explorerData}
          loading={loadingExplorer}
          error={explorerError}
          onRefresh={fetchExplorerData}
          onViewData={handleViewCollectionData}
          initialExpandedDb="test"
          labels={{
            initializing: t('nosql.explorer.initializing'),
            retry: t('nosql.explorer.retryBtn'),
            viewData: t('nosql.explorer.viewDataBtn'),
            viewDataTitle: 'View Documents (Mongo Shell)',
            emptyTables: t('nosql.explorer.noCollections'),
            tableSuffix: ' (Collection)',
          }}
        />
      </TabPanel>

      <TabPanel visible={activeTab === 'shell'}>
        <QueryShellTab
          promptLabel="Interactive mongosh execution console"
          value={mongoQuery}
          onChange={setMongoQuery}
          onExecute={handleExecuteQuery}
          executing={executing}
          output={queryOutput}
          labels={{
            placeholder: t('nosql.shell.placeholder'),
            execute: t('nosql.shell.executeBtn'),
            executing: t('nosql.shell.executingBtn'),
            consoleTitle: t('nosql.shell.consoleTitle'),
            emptyOutput: t('nosql.shell.emptyOutput'),
          }}
        />
      </TabPanel>

      <TabPanel visible={activeTab === 'cheatsheet'}>
        <CheatSheetTab entries={mongoCheatSheet} searchPlaceholder={t('nosql.cheatsheet.placeholder')} />
      </TabPanel>
    </InspectorModal>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
