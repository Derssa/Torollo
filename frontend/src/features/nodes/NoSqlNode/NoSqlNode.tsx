import { Braces, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BaseNode from '../components/BaseNode';
import styles from '../ServiceNode.module.css';

interface NoSqlNodeProps {
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

export default function NoSqlNode({ data }: NoSqlNodeProps) {
  const { t } = useTranslation();
  const isRunning = data.state === 'running';

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      errorMessage={data.lastError}
      icon={<Braces size={18} color={isRunning ? 'var(--neutral-600)' : 'var(--neutral-500)'} />}
      customBorder={isRunning ? '1px solid var(--neutral-600)' : undefined}
      subtitle={
        <>
          <span className={styles.label}>{t('nodeviz.ipPort')}</span>
          <span className={styles.value} style={{ color: data.ip ? 'var(--color-success)' : undefined }}>{data.ip ? `${data.ip}:27017` : '27017'}</span>
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
        color: 'var(--neutral-600)', // Charcoal Gray
        onClick: data.onInspect,
        title: t('nodeviz.inspectDatabaseTitle'),
      }}
    />
  );
}
