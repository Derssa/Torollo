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
      icon={<GitFork size={18} color={isRunning ? 'var(--color-danger)' : 'var(--neutral-500)'} />}
      customBorder="2px solid var(--color-danger)"
      customTitleColor="var(--color-danger)"
      subtitle={
        <>
          <span className={styles.label}>{t('nodeviz.ipAddress')}</span>
          <span className={styles.value} style={{ color: data.ip ? 'var(--color-success)' : undefined }}>{data.ip || t('nodeviz.private')}</span>
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
        color: 'var(--color-danger)',
        onClick: data.onInspect,
        title: t('nodeviz.loadBalancerConfigTitle'),
      }}
    />
  );
}
