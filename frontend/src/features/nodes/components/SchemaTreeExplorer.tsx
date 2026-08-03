import { useState } from 'react';
import { Database, Table, Columns, RefreshCw, AlertCircle, Eye, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { inspectorStyles } from './inspectorStyles';

export interface DBColumn {
  name: string;
  type: string;
}

export interface DBTable {
  name: string;
  columns: DBColumn[];
}

export interface DBNode {
  database: string;
  tables: DBTable[];
  error?: boolean;
}

interface SchemaTreeExplorerProps {
  title: string;
  data: DBNode[];
  loading: boolean;
  /** 'starting_up' shows the initializing spinner; any other string the error + retry. */
  error: string | null;
  onRefresh: () => void;
  onViewData: (database: string, tableName: string) => void;
  /** Database expanded by default (e.g. 'postgres', 'test'). */
  initialExpandedDb: string;
  labels: {
    initializing: string;
    retry: string;
    viewData: string;
    viewDataTitle: string;
    emptyTables: string;
    /** Appended to each table name (e.g. ' (Collection)' for Mongo). */
    tableSuffix?: string;
  };
}

/**
 * Expandable database → table/collection → column tree shared by the Postgres
 * and Mongo explorers (Redis keeps its own flat key list).
 */
export default function SchemaTreeExplorer({
  title,
  data,
  loading,
  error,
  onRefresh,
  onViewData,
  initialExpandedDb,
  labels,
}: SchemaTreeExplorerProps) {
  const { t } = useTranslation();
  const [expandedDBs, setExpandedDBs] = useState<Record<string, boolean>>({ [initialExpandedDb]: true });
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const toggleDBExpand = (db: string) => {
    setExpandedDBs(prev => ({ ...prev, [db]: !prev[db] }));
  };

  const toggleTableExpand = (tblKey: string) => {
    setExpandedTables(prev => ({ ...prev, [tblKey]: !prev[tblKey] }));
  };

  return (
    <div style={inspectorStyles.tabContent}>
      <div style={inspectorStyles.sectionHeader}>
        <span style={inspectorStyles.sectionTitle}>{title}</span>
        <button onClick={onRefresh} disabled={loading} style={inspectorStyles.iconActionBtn}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <div style={inspectorStyles.explorerTree}>
        {error ? (
          error === 'starting_up' ? (
            <div style={inspectorStyles.errorContainer}>
              <Loader2 size={24} className="spin" color="var(--color-accent)" style={{ marginBottom: 12 }} />
              <span style={inspectorStyles.errorMessage}>{labels.initializing}</span>
            </div>
          ) : (
            <div style={inspectorStyles.errorContainer}>
              <AlertCircle size={24} color="var(--color-danger)" style={{ marginBottom: 12 }} />
              <span style={inspectorStyles.errorMessage}>{error}</span>
              <button onClick={onRefresh} style={inspectorStyles.retryBtn}>
                <RefreshCw size={12} style={{ marginRight: 6 }} />
                {labels.retry}
              </button>
            </div>
          )
        ) : data.map(node => (
          <div key={node.database} style={inspectorStyles.treeNode}>
            <div style={styles.clickableTreeRow} onClick={() => toggleDBExpand(node.database)}>
              <Database size={16} color="var(--color-accent)" style={{ marginRight: 8 }} />
              <span style={styles.dbName}>{node.database}</span>
              {node.error && (
                <span title={t('nodeshared.schema.offlineUnreachable')}>
                  <AlertCircle size={14} color="var(--color-danger)" style={{ marginLeft: 8 }} />
                </span>
              )}
            </div>

            {expandedDBs[node.database] && (
              <div style={styles.treeChildren}>
                {node.tables.length > 0 ? (
                  node.tables.map(table => {
                    const tblKey = `${node.database}:${table.name}`;
                    return (
                      <div key={table.name} style={inspectorStyles.treeNode}>
                        <div style={styles.clickableTreeRow} onClick={() => toggleTableExpand(tblKey)}>
                          <Table size={14} color="var(--color-success)" style={{ marginRight: 8 }} />
                          <span style={styles.tableName}>{table.name}{labels.tableSuffix || ''}</span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewData(node.database, table.name);
                            }}
                            style={inspectorStyles.inlineViewBtn}
                            title={labels.viewDataTitle}
                            className="glass"
                          >
                            <Eye size={12} style={{ marginRight: 4 }} />
                            {labels.viewData}
                          </button>
                        </div>

                        {expandedTables[tblKey] && (
                          <div style={styles.treeChildren}>
                            {table.columns.map(col => (
                              <div key={col.name} style={styles.columnRow}>
                                <Columns size={12} color="var(--color-text-muted)" style={{ marginRight: 8 }} />
                                <span style={styles.columnName}>{col.name}</span>
                                <span style={styles.columnType}>{col.type}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div style={styles.treeRowEmptyIndented}>{labels.emptyTables}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  clickableTreeRow: {
    ...inspectorStyles.treeRow,
    cursor: 'pointer',
  },
  treeRowEmptyIndented: {
    ...inspectorStyles.treeRowEmpty,
    paddingLeft: '32px',
  },
  treeChildren: {
    paddingLeft: '24px',
    borderLeft: '1px dashed var(--border-color)',
    marginTop: '2px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  dbName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  tableName: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  columnRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    fontSize: '12px',
  },
  columnName: {
    color: 'var(--color-text-primary)',
    fontWeight: 500,
    marginRight: '8px',
  },
  columnType: {
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
    fontSize: '11px',
  },
};
