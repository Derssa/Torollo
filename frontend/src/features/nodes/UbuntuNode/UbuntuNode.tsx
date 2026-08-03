import { Terminal as TermIcon, Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BaseNode from '../components/BaseNode';
import styles from '../ServiceNode.module.css';

interface UbuntuNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    lastError?: string;
    ip?: string;
    subnetType?: 'public' | 'private';
    port?: string | number;
    onSecurityGroupOpen?: (id: string, name: string) => void;
    onTerminalOpen: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
    onRename?: (id: string, currentName: string) => void;
  };
}

export default function UbuntuNode({ data }: UbuntuNodeProps) {
  const { t } = useTranslation();
  const isRunning = data.state === 'running';

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      errorMessage={data.lastError}
      icon={<Cpu size={18} color={isRunning ? 'var(--color-accent)' : 'var(--neutral-500)'} />}
      customTitleColor="var(--color-text-primary)"
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
        label: t('nodeviz.terminal'),
        icon: <TermIcon size={14} />,
        onClick: data.onTerminalOpen,
        title: t('nodeviz.openTerminal'),
      }}
    />
  );
}
