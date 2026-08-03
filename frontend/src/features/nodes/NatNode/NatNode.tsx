import { ArrowRightLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BaseNode from '../components/BaseNode';
import styles from '../ServiceNode.module.css';

interface NatNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    lastError?: string;
    ip?: string;
    onInspect: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
    onRename?: (id: string, currentName: string) => void;
  };
}

export default function NatNode({ data }: NatNodeProps) {
  const { t } = useTranslation();
  const isRunning = data.state === 'running';

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      errorMessage={data.lastError}
      icon={<ArrowRightLeft size={18} color={isRunning ? 'var(--color-violet)' : 'var(--neutral-500)'} />}
      customBorder="2px solid var(--color-violet)"
      customTitleColor="var(--color-violet-strong)"
      hideHandles={true}
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
      primaryAction={{
        label: t('nodeviz.infoGuide'),
        icon: <ArrowRightLeft size={14} />,
        color: 'var(--color-violet)',
        onClick: data.onInspect,
        title: t('nodeviz.natInfoGuideTitle'),
      }}
    />
  );
}
