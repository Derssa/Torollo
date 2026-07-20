import { Database, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BaseNode from '../components/BaseNode';
import styles from '../ServiceNode.module.css';

interface PostgresNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    lastError?: string;
    ip?: string;
    onSecurityGroupOpen?: (id: string, name: string) => void;
    onInspect: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
    onRename?: (id: string, currentName: string) => void;
  };
}

export default function PostgresNode({ data }: PostgresNodeProps) {
  const { t } = useTranslation();
  const isRunning = data.state === 'running';

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      errorMessage={data.lastError}
      icon={<Database size={18} color={isRunning ? '#64748B' : '#6B7280'} />}
      customBorder={isRunning ? '1px solid #64748B' : undefined}
      subtitle={
        <>
          <span className={styles.label}>{t('nodeviz.ipPort')}</span>
          <span className={styles.value} style={{ color: data.ip ? '#10B981' : undefined }}>{data.ip ? `${data.ip}:5432` : '5432'}</span>
        </>
      }
      onStart={data.onStart}
      onStop={data.onStop}
      onDelete={data.onDelete}
      onRename={data.onRename}
      onSecurityGroupOpen={data.onSecurityGroupOpen}
      primaryAction={{
        label: t('nodeviz.inspect'),
        icon: <Search size={14} />,
        color: '#64748B', // Slate Gray
        onClick: data.onInspect,
        title: t('nodeviz.inspectDatabaseTitle'),
      }}
    />
  );
}
