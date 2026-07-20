import { useTranslation } from 'react-i18next';
import InputModal from '../../../shared/components/InputModal';
import type { ContainerData } from '../../../shared/types';

const META_BY_TYPE: Record<string, { titleKey: string; placeholderKey: string; prefix: string }> = {
  ubuntu: { titleKey: 'nodeLibrary.createNode.titles.ubuntu', placeholderKey: 'nodeLibrary.createNode.placeholders.ubuntu', prefix: 'srv-' },
  postgres: { titleKey: 'nodeLibrary.createNode.titles.postgres', placeholderKey: 'nodeLibrary.createNode.placeholders.postgres', prefix: 'sql-' },
  sql: { titleKey: 'nodeLibrary.createNode.titles.postgres', placeholderKey: 'nodeLibrary.createNode.placeholders.postgres', prefix: 'sql-' },
  nosql: { titleKey: 'nodeLibrary.createNode.titles.nosql', placeholderKey: 'nodeLibrary.createNode.placeholders.nosql', prefix: 'nosql-' },
  redis: { titleKey: 'nodeLibrary.createNode.titles.redis', placeholderKey: 'nodeLibrary.createNode.placeholders.redis', prefix: 'redis-' },
  nat: { titleKey: 'nodeLibrary.createNode.titles.nat', placeholderKey: 'nodeLibrary.createNode.placeholders.nat', prefix: 'nat-' },
  loadbalancer: { titleKey: 'nodeLibrary.createNode.titles.loadbalancer', placeholderKey: 'nodeLibrary.createNode.placeholders.loadbalancer', prefix: 'alb-' },
  autoscalinggroup: { titleKey: 'nodeLibrary.createNode.titles.autoscalinggroup', placeholderKey: 'nodeLibrary.createNode.placeholders.autoscalinggroup', prefix: 'asg-' },
};

interface CreateNodeModalProps {
  type: string;
  containers: ContainerData[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/** Name prompt for a dropped node, pre-filled with the first free `<prefix><n>` name. */
export default function CreateNodeModal({ type, containers, onSubmit, onCancel }: CreateNodeModalProps) {
  const { t } = useTranslation();
  const meta = META_BY_TYPE[type] ?? META_BY_TYPE.ubuntu;

  let suffix = 1;
  while (containers.some(c => c.name === `${meta.prefix}${suffix}`)) {
    suffix++;
  }

  return (
    <InputModal
      title={t(meta.titleKey)}
      label={t('nodeLibrary.createNode.label')}
      placeholder={t(meta.placeholderKey)}
      maxLength={20}
      restrictPattern={/[^a-zA-Z0-9-]/g}
      defaultValue={`${meta.prefix}${suffix}`}
      submitText={t('nodeLibrary.createNode.submit')}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}
