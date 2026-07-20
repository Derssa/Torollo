import { GitFork, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BaseNode from '../components/BaseNode';
import styles from '../ServiceNode.module.css';

interface LoadBalancerNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    lastError?: string;
    ip?: string;
    port?: string | number;
    config?: {
      loadBalancerAlgorithm?: 'round_robin' | 'least_conn';
      loadBalancerTargets?: string[];
    };
    onSecurityGroupOpen?: (id: string, name: string) => void;
    onInspect: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
    onRename?: (id: string, currentName: string) => void;
  };
}

export default function LoadBalancerNode({ data }: LoadBalancerNodeProps) {
  const { t } = useTranslation();
  const isRunning = data.state === 'running';

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      errorMessage={data.lastError}
      icon={<GitFork size={18} color={isRunning ? '#EF4444' : '#6B7280'} />}
      customBorder="2px solid #EF4444"
      customTitleColor="#DC2626"
      subtitle={
        <>
          <span className={styles.label}>{t('nodeviz.ipAddress')}</span>
          <span className={styles.value} style={{ color: data.ip ? '#10B981' : undefined }}>{data.ip || t('nodeviz.private')}</span>
        </>
      }
      onStart={data.onStart}
      onStop={data.onStop}
      onDelete={data.onDelete}
      onRename={data.onRename}
      onSecurityGroupOpen={data.onSecurityGroupOpen}
      primaryAction={{
        label: t('nodeviz.configure'),
        icon: <Settings size={14} />,
        color: '#EF4444',
        onClick: data.onInspect,
        title: t('nodeviz.loadBalancerConfigTitle'),
      }}
    />
  );
}
