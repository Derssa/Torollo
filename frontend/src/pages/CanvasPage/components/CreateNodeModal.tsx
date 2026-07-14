import InputModal from '../../../shared/components/InputModal';
import type { ContainerData } from '../../../shared/types';

const COPY_BY_TYPE: Record<string, { title: string; placeholder: string; prefix: string }> = {
  ubuntu: { title: 'Create Ubuntu Node', placeholder: 'e.g. server-1', prefix: 'srv-' },
  postgres: { title: 'Create SQL Database Node', placeholder: 'e.g. sql-1', prefix: 'sql-' },
  sql: { title: 'Create SQL Database Node', placeholder: 'e.g. sql-1', prefix: 'sql-' },
  nosql: { title: 'Create NoSQL Database Node', placeholder: 'e.g. nosql-1', prefix: 'nosql-' },
  redis: { title: 'Create Cache Store Node', placeholder: 'e.g. redis-1', prefix: 'redis-' },
  nat: { title: 'Create NAT Gateway Node', placeholder: 'e.g. nat-1', prefix: 'nat-' },
  loadbalancer: { title: 'Create Load Balancer Node', placeholder: 'e.g. alb-1', prefix: 'alb-' },
  autoscalinggroup: { title: 'Create Auto Scaling Group Node', placeholder: 'e.g. asg-1', prefix: 'asg-' },
};

interface CreateNodeModalProps {
  type: string;
  containers: ContainerData[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/** Name prompt for a dropped node, pre-filled with the first free `<prefix><n>` name. */
export default function CreateNodeModal({ type, containers, onSubmit, onCancel }: CreateNodeModalProps) {
  const copy = COPY_BY_TYPE[type] ?? COPY_BY_TYPE.ubuntu;

  let suffix = 1;
  while (containers.some(c => c.name === `${copy.prefix}${suffix}`)) {
    suffix++;
  }

  return (
    <InputModal
      title={copy.title}
      label="Give your new container a descriptive name."
      placeholder={copy.placeholder}
      maxLength={20}
      restrictPattern={/[^a-zA-Z0-9-]/g}
      defaultValue={`${copy.prefix}${suffix}`}
      submitText="Create Node"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}
