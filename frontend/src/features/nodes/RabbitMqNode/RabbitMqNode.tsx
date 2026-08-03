import { MessageSquare, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BaseNode from '../components/BaseNode';
import styles from '../ServiceNode.module.css';

interface RabbitMqNodeProps {
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

export default function RabbitMqNode({ data }: RabbitMqNodeProps) {
  const { t } = useTranslation();
  const isRunning = data.state === 'running';
  const accentColor = 'var(--color-orange)'; // RabbitMQ Orange

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      errorMessage={data.lastError}
      icon={<MessageSquare size={18} color={isRunning ? accentColor : 'var(--neutral-500)'} />}
      customBorder={isRunning ? `1px solid ${accentColor}` : undefined}
      subtitle={
        <>
          <span className={styles.label}>{t('nodeviz.ipPort')}</span>
          <span className={styles.value} style={{ color: data.ip ? 'var(--color-success)' : undefined }}>
            {data.ip ? `${data.ip}:5672` : '5672 / 15672'}
          </span>
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
        color: accentColor,
        onClick: data.onInspect,
        title: t('nodeviz.inspectRabbitmqTitle'),
      }}
    />
  );
}
