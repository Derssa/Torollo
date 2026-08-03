import { Layers, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BaseNode from '../components/BaseNode';
import styles from '../ServiceNode.module.css';

interface AsgNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    lastError?: string;
    ip?: string;
    config?: {
      asgs?: Record<string, { desiredCapacity: number; minCapacity?: number; maxCapacity?: number; parentId?: string; subnetIds?: string[] }>;
    };
    // Active ASG metadata mapped from CanvasPage
    asgConfig?: {
      desiredCapacity: number;
      minCapacity?: number;
      maxCapacity?: number;
      parentId?: string;
      subnetIds?: string[];
      parentName?: string;
    };
    instanceCount?: number;
    onSecurityGroupOpen?: (id: string, name: string) => void;
    onInspect: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
    onRename?: (id: string, currentName: string) => void;
  };
}

export default function AsgNode({ data }: AsgNodeProps) {
  const { t } = useTranslation();
  const isRunning = data.state === 'running';

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      errorMessage={data.lastError}
      icon={<Layers size={18} color={isRunning ? 'var(--color-pink)' : 'var(--neutral-500)'} />}
      customBorder="2px dashed var(--color-pink)"
      customTitleColor="var(--color-pink-hover)"
      hideHandles={true}
      subtitle={
        <>
          <span className={styles.label}>{t('nodeviz.instances')}</span>
          <span className={styles.value}>{t('nodeviz.countRunning', { count: data.instanceCount || 0 })}</span>
        </>
      }
      onStart={data.onStart}
      onStop={data.onStop}
      onDelete={data.onDelete}
      onRename={data.onRename}
      primaryAction={{
        label: t('nodeviz.inspect'),
        icon: <Settings size={14} />,
        color: 'var(--color-pink)',
        onClick: data.onInspect,
        title: t('nodeviz.asgInspectTitle'),
      }}
    />
  );
}
