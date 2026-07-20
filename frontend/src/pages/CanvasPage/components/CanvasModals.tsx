import { useTranslation } from 'react-i18next';
import PostgresModal from '../../../features/nodes/PostgresNode/PostgresModal';
import NoSqlModal from '../../../features/nodes/NoSqlNode/NoSqlModal';
import RedisModal from '../../../features/nodes/RedisNode/RedisModal';
import NatGatewayModal from '../../../features/nodes/NatNode/NatGatewayModal';
import LoadBalancerModal from '../../../features/nodes/LoadBalancerNode/LoadBalancerModal';
import AsgModal from '../../../features/nodes/AsgNode/AsgModal';
import RoutingTableModal from '../../../features/nodes/SubnetNode/RoutingTableModal';
import SecurityGroupsModal from '../../../features/nodes/SecurityGroups/SecurityGroupsModal';
import VpcModal from '../../../features/nodes/VpcNode/VpcModal';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import InputModal from '../../../shared/components/InputModal';
import CreateNodeModal from './CreateNodeModal';
import type { ContainerData } from '../../../shared/types';
import type { NetworkConfig } from '../../../shared/types/network';

/** Which inspector modal is open. They are mutually exclusive, hence one state. */
export interface InspectorState {
  kind: 'postgres' | 'nosql' | 'redis' | 'nat' | 'loadbalancer' | 'asg' | 'subnet-routes' | 'security-group';
  id: string;
  name: string;
  /** Only set for kind 'security-group' (the modal displays the node type). */
  nodeType?: string;
}

interface CanvasModalsProps {
  projectId: string;
  containers: ContainerData[];
  networkConfig: NetworkConfig;
  saveNetworkConfig: (config: NetworkConfig) => Promise<unknown>;
  triggerArchitectureAudit: (config: NetworkConfig) => void;
  showToast: (message: string) => void;
  fetchContainers: () => Promise<void>;
  createNode: { type: string; onSubmit: (name: string) => void; onCancel: () => void } | null;
  deleteNode: { onConfirm: () => void; onCancel: () => void } | null;
  renameNode: { currentName: string; onSubmit: (name: string) => void; onCancel: () => void } | null;
  inspector: InspectorState | null;
  onCloseInspector: () => void;
  vpcSettings: { onClose: () => void } | null;
  trafficSimulator: { onClose: () => void } | null;
}

/** All CanvasPage modals: create/delete/rename dialogs, node inspectors and the VPC modal. */
export default function CanvasModals({
  projectId,
  containers,
  networkConfig,
  saveNetworkConfig,
  triggerArchitectureAudit,
  showToast,
  fetchContainers,
  createNode,
  deleteNode,
  renameNode,
  inspector,
  onCloseInspector,
  vpcSettings,
  trafficSimulator,
}: CanvasModalsProps) {
  const { t } = useTranslation();
  const renderVpcModal = (initialTab: 'info' | 'simulator', onClose: () => void) => (
    <VpcModal
      vpcConfig={networkConfig.vpcConfig}
      subnets={networkConfig.subnets}
      nodes={containers}
      nodeSecurityGroups={networkConfig.nodeSecurityGroups}
      nodeSubnetMap={networkConfig.nodeSubnetMap}
      onClose={onClose}
      onSaveVpcConfig={(config) => {
        const newConfig = { ...networkConfig, vpcConfig: config };
        saveNetworkConfig(newConfig);
        onClose();
        showToast(t('toasts.vpcConfigSaved'));
        triggerArchitectureAudit(newConfig);
      }}
      initialTab={initialTab}
    />
  );

  return (
    <>
      {createNode && (
        <CreateNodeModal
          type={createNode.type}
          containers={containers}
          onSubmit={createNode.onSubmit}
          onCancel={createNode.onCancel}
        />
      )}

      {deleteNode && (
        <ConfirmModal
          title={t('common.deleteContainerTitle')}
          message={t('common.deleteContainerMessage')}
          confirmText={t('common.delete')}
          variant="danger"
          onConfirm={deleteNode.onConfirm}
          onCancel={deleteNode.onCancel}
        />
      )}

      {renameNode && (
        <InputModal
          title={t('common.renameNodeTitle')}
          label={t('common.renameNodeLabel')}
          placeholder="e.g. api-gateway"
          maxLength={20}
          restrictPattern={/[^a-zA-Z0-9-]/g}
          defaultValue={renameNode.currentName}
          submitText={t('common.rename')}
          onSubmit={renameNode.onSubmit}
          onCancel={renameNode.onCancel}
        />
      )}

      {inspector?.kind === 'postgres' && (
        <PostgresModal
          containerId={inspector.id}
          nodeName={inspector.name}
          projectId={projectId}
          onClose={onCloseInspector}
        />
      )}

      {inspector?.kind === 'nosql' && (
        <NoSqlModal
          containerId={inspector.id}
          nodeName={inspector.name}
          projectId={projectId}
          onClose={onCloseInspector}
        />
      )}

      {inspector?.kind === 'redis' && (
        <RedisModal
          containerId={inspector.id}
          nodeName={inspector.name}
          projectId={projectId}
          onClose={onCloseInspector}
        />
      )}

      {inspector?.kind === 'nat' && (
        <NatGatewayModal
          nodeName={inspector.name}
          ipAddress={containers.find(c => c.id === inspector.id)?.ip || networkConfig.nodeIpMap?.[inspector.id]}
          state={containers.find(c => c.id === inspector.id)?.state || 'stopped'}
          onClose={onCloseInspector}
        />
      )}

      {inspector?.kind === 'loadbalancer' && (
        <LoadBalancerModal
          containerId={inspector.id}
          nodeName={inspector.name}
          ipAddress={containers.find(c => c.id === inspector.id)?.ip || networkConfig.nodeIpMap?.[inspector.id]}
          port={containers.find(c => c.id === inspector.id)?.port}
          state={containers.find(c => c.id === inspector.id)?.state || 'stopped'}
          config={{
            loadBalancerAlgorithm: networkConfig.loadBalancerAlgorithms?.[inspector.id],
            loadBalancerTargets: networkConfig.loadBalancerTargets?.[inspector.id],
            loadBalancerTargetPort: networkConfig.loadBalancerTargetPorts?.[inspector.id],
            loadBalancerRoutingRules: networkConfig.loadBalancerRoutingRules?.[inspector.id]
          }}
          allNodes={containers}
          onClose={onCloseInspector}
          onSaveConfig={async (algorithm, targets, targetPort, routingRules) => {
            const newConfig = {
              ...networkConfig,
              loadBalancerAlgorithms: { ...(networkConfig.loadBalancerAlgorithms || {}), [inspector.id]: algorithm },
              loadBalancerTargets: { ...(networkConfig.loadBalancerTargets || {}), [inspector.id]: targets },
              loadBalancerTargetPorts: { ...(networkConfig.loadBalancerTargetPorts || {}), [inspector.id]: targetPort },
              loadBalancerRoutingRules: { ...(networkConfig.loadBalancerRoutingRules || {}), [inspector.id]: routingRules }
            };
            await saveNetworkConfig(newConfig);
            showToast(t('toasts.lbConfigApplied'));
            triggerArchitectureAudit(newConfig);
          }}
        />
      )}

      {inspector?.kind === 'asg' && (
        <AsgModal
          asgId={inspector.id}
          nodeName={inspector.name}
          projectId={projectId}
          config={networkConfig}
          containers={containers}
          onClose={onCloseInspector}
          onSaveConfig={async (asgConfig) => {
            const newConfig = {
              ...networkConfig,
              asgs: { ...(networkConfig.asgs || {}), [inspector.id]: asgConfig }
            };
            await saveNetworkConfig(newConfig);
            showToast(t('toasts.asgConfigSaved'));
            triggerArchitectureAudit(newConfig);
          }}
          onRefreshContainers={fetchContainers}
        />
      )}

      {inspector?.kind === 'subnet-routes' && (
        <RoutingTableModal
          subnetId={inspector.id}
          subnetName={inspector.name}
          routes={networkConfig.subnets.find(s => s.id === inspector.id)?.routes || []}
          natGateways={containers.filter(c => c.type === 'nat').map(c => c.name)}
          onClose={onCloseInspector}
          onSave={async (updatedRoutes) => {
            const updatedSubnets = networkConfig.subnets.map(s => {
              if (s.id === inspector.id) {
                return { ...s, routes: updatedRoutes };
              }
              return s;
            });
            await saveNetworkConfig({ ...networkConfig, subnets: updatedSubnets });
          }}
        />
      )}

      {inspector?.kind === 'security-group' && (
        <SecurityGroupsModal
          nodeId={inspector.id}
          nodeName={inspector.name}
          nodeType={inspector.nodeType || 'ubuntu'}
          allNodes={containers}
          allSubnets={networkConfig.subnets.map(s => ({ id: s.id, name: s.name }))}
          rules={networkConfig.nodeSecurityGroups[inspector.id] || []}
          onClose={onCloseInspector}
          onSaveRules={(rules) => {
            const newConfig = {
              ...networkConfig,
              nodeSecurityGroups: { ...networkConfig.nodeSecurityGroups, [inspector.id]: rules }
            };
            saveNetworkConfig(newConfig);
            triggerArchitectureAudit(newConfig);
          }}
        />
      )}

      {vpcSettings && renderVpcModal('info', vpcSettings.onClose)}

      {trafficSimulator && renderVpcModal('simulator', trafficSimulator.onClose)}
    </>
  );
}
