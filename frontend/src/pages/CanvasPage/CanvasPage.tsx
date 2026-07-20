import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactFlow, Background, Controls, BackgroundVariant, useNodesState } from '@xyflow/react';
import type { Node, Edge, ReactFlowInstance, Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import UbuntuNode from '../../features/nodes/UbuntuNode/UbuntuNode';
import NatNode from '../../features/nodes/NatNode/NatNode';
import PostgresNode from '../../features/nodes/PostgresNode/PostgresNode';
import NoSqlNode from '../../features/nodes/NoSqlNode/NoSqlNode';
import RedisNode from '../../features/nodes/RedisNode/RedisNode';
import RabbitMqNode from '../../features/nodes/RabbitMqNode/RabbitMqNode';
import LoadBalancerNode from '../../features/nodes/LoadBalancerNode/LoadBalancerNode';
import AsgNode from '../../features/nodes/AsgNode/AsgNode';
import VpcNode from '../../features/nodes/VpcNode/VpcNode';
import SubnetNode from '../../features/nodes/SubnetNode/SubnetNode';
import NodeLibrary from './components/NodeLibrary';
import LearningPanel from '../../features/learning/components/LearningPanel';
import { useContainers } from '../../shared/hooks/useContainers';
import { useToast } from '../../shared/hooks/useToast';
import { ToastNotification } from '../../shared/components/Toast';
import { DockerUnavailableBanner } from '../../shared/components/DockerUnavailableBanner';
import CanvasTopbar from './components/CanvasTopbar';
import CanvasFooter from './components/CanvasFooter';
import CanvasModals from './components/CanvasModals';
import type { InspectorState } from './components/CanvasModals';
import ButtonEdge from './components/ButtonEdge';
import { API_BASE } from '../../shared/types';
import { useNetworkConfig } from './hooks/useNetworkConfig';
import { useCanvasDragDrop } from './hooks/useCanvasDragDrop';
import { positionToCell, resolveSubnetChildPosition, subnetSize } from './utils/canvasGeometry';
import {
  addConnectionRule,
  parseEdgeId,
  removeEdgeRule,
  removeRulesForConnections,
  buildFirewallEdges,
} from './utils/securityRules';
import { assignNodeToSubnet, removeNodeFromConfig } from './utils/networkConfigOps';

interface CanvasPageProps {
  projectId: string;
  projectName: string;
  onBackToProjects: () => void;
  onTerminalOpen: (id: string, name: string) => void;
}

/** Inspector opened by each node type's magnifier action ('sql' shares the Postgres modal). */
const INSPECTOR_KIND_BY_NODE_TYPE: Record<string, InspectorState['kind']> = {
  postgres: 'postgres',
  sql: 'postgres',
  nosql: 'nosql',
  redis: 'redis',
  rabbitmq: 'rabbitmq',
  nat: 'nat',
  loadbalancer: 'loadbalancer',
  autoscalinggroup: 'asg',
};

export default function CanvasPage({ projectId, projectName, onBackToProjects, onTerminalOpen }: CanvasPageProps) {
  const { t } = useTranslation();
  const { toast, showNotification, showToast, dismissToast } = useToast();

  const {
    containers,
    loading,
    creating,
    opErrors,
    dockerUnavailable,
    fetchContainers,
    createContainer,
    startContainer,
    stopContainer,
    deleteContainer,
  } = useContainers({ projectId, onNotify: showNotification });

  // Modal and inspector states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [inspector, setInspector] = useState<InspectorState | null>(null);
  const closeInspector = () => setInspector(null);

  // Rename modal state
  const [renamingNode, setRenamingNode] = useState<{ id: string; currentName: string } | null>(null);

  // Drag and drop tracking
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [dropState, setDropState] = useState<{ position: { x: number; y: number }; type: string } | null>(null);
  const dropPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const dropSubnetsRef = useRef<Record<string, string>>({});
  const pendingSubnetIdRef = useRef<string | null>(null);

  // React Flow managed nodes state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  // Ref to track saved positions (avoids re-render loops)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const { networkConfig, saveNetworkConfig, fetchNetworkConfig, triggerArchitectureAudit } =
    useNetworkConfig({ projectId, containers, showNotification });

  // A service was dropped inside a subnet: stash the drop context and open the create modal
  const onRequestCreateNode = useCallback((drop: { position: { x: number; y: number }; type: string; subnetId: string }) => {
    setDropState({ position: drop.position, type: drop.type });
    pendingSubnetIdRef.current = drop.subnetId;
    setShowCreateModal(true);
  }, []);

  const { onNodeDragStart, onNodeDrag, onNodeDragStop, onNodesDelete, onDragOver, onDrop, draggingNodeIdRef } =
    useCanvasDragDrop({
      reactFlowInstance,
      networkConfig,
      containers,
      positionsRef,
      setNodes,
      projectId,
      saveNetworkConfig,
      triggerArchitectureAudit,
      showNotification,
      fetchContainers,
      onRequestCreateNode,
    });

  const [showVpcSettings, setShowVpcSettings] = useState(false);
  const [showTrafficSimulator, setShowTrafficSimulator] = useState(false);
  const [showLearning, setShowLearning] = useState(false);

  const nodeTypes = useMemo(() => ({
    ubuntu: UbuntuNode,
    postgres: PostgresNode,
    sql: PostgresNode,
    nosql: NoSqlNode,
    redis: RedisNode,
    rabbitmq: RabbitMqNode,
    nat: NatNode,
    vpc: VpcNode,
    subnet: SubnetNode,
    loadbalancer: LoadBalancerNode,
    autoscalinggroup: AsgNode
  }), []);

  const edgeTypes = useMemo(() => ({
    buttonEdge: ButtonEdge
  }), []);

  const handleDeleteSubnet = useCallback((subnetId: string) => {
    const hasNodes = Object.values(networkConfig.nodeSubnetMap).some(sid => sid === subnetId);
    if (hasNodes) {
      showNotification({
        type: 'error',
        message: t('toasts.subnetDeleteBlocked')
      });
      return;
    }

    const updatedSubnets = networkConfig.subnets.filter(s => s.id !== subnetId);
    const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
    Object.keys(updatedNodeSubnetMap).forEach(k => {
      if (updatedNodeSubnetMap[k] === subnetId) delete updatedNodeSubnetMap[k];
    });
    const newConfig = { ...networkConfig, subnets: updatedSubnets, nodeSubnetMap: updatedNodeSubnetMap };
    saveNetworkConfig(newConfig);
    showToast(t('toasts.subnetDeleted'));
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit, showNotification, t]);

  const handleSubnetResize = useCallback((subnetId: string, dimension: 'columns' | 'rows', newValue: number) => {
    if (dimension === 'columns' && newValue < 2) return;
    if (dimension === 'rows' && newValue < 1) return;

    const subnet = networkConfig.subnets.find(s => s.id === subnetId);
    if (!subnet) return;

    const currentCols = subnet.columns || 2;
    const currentRows = subnet.rows || 1;

    let targetCols = currentCols;
    let targetRows = currentRows;
    if (dimension === 'columns') targetCols = newValue;
    if (dimension === 'rows') targetRows = newValue;

    // Verify if any node inside this subnet lies outside the new boundaries
    if (targetCols < currentCols || targetRows < currentRows) {
      const subnetNodes = containers.filter(c => networkConfig.nodeSubnetMap[c.id] === subnetId);
      for (const node of subnetNodes) {
        const pos = positionsRef.current[node.id];
        if (pos) {
          const { col, row } = positionToCell(pos);
          if (col >= targetCols || row >= targetRows) {
            showNotification({
              type: 'error',
              message: t('toasts.gridShrinkBlocked', { name: node.name })
            });
            return;
          }
        }
      }
    }

    const updatedSubnets = networkConfig.subnets.map(s => {
      if (s.id === subnetId) {
        const cols = dimension === 'columns' ? newValue : (s.columns || 2);
        const rows = dimension === 'rows' ? newValue : (s.rows || 1);
        return {
          ...s,
          columns: cols,
          rows: rows,
          ...subnetSize(cols, rows)
        };
      }
      return s;
    });

    const newConfig = { ...networkConfig, subnets: updatedSubnets };
    saveNetworkConfig(newConfig);
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, containers, saveNetworkConfig, triggerArchitectureAudit, showNotification, t]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    const parsed = parseEdgeId(edgeId);
    if (!parsed) return;

    const newConfig = removeEdgeRule(networkConfig, parsed.sourceId, parsed.targetId, parsed.port);
    if (!newConfig) return;

    saveNetworkConfig(newConfig);
    showToast(t('toasts.firewallConnectionRemoved'));
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit, t]);

  // Dynamic edges representing firewall rules
  const edges = useMemo(
    () => buildFirewallEdges(containers, networkConfig, handleDeleteEdge),
    [containers, networkConfig, handleDeleteEdge]
  );

  // Handle manual connection line draws (automatically updates security group)
  const onConnect = useCallback((connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target) return;
    const targetNode = containers.find(n => n.id === target);
    const sourceNode = containers.find(n => n.id === source);
    if (!targetNode) return;

    const result = addConnectionRule(networkConfig, source, target, targetNode.type || 'ubuntu');
    if (!result) return;

    saveNetworkConfig(result.config);
    const sourceName = sourceNode?.name || source;
    const traffic = result.port === 'ALL' ? t('toasts.sgAllTraffic') : t('toasts.sgPort', { port: result.port });
    showToast(t('toasts.sgAllowedInbound', { traffic, source: sourceName }));
    triggerArchitectureAudit(result.config);
  }, [containers, networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit, t]);

  // Handle connection line deletion (removes matching firewall rule)
  const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    const newConfig = removeRulesForConnections(
      networkConfig,
      deletedEdges.map(edge => ({ source: edge.source, target: edge.target }))
    );
    if (!newConfig) return;

    saveNetworkConfig(newConfig);
    showToast(t('toasts.firewallRuleRemoved'));
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit, t]);

  // Load saved positions, network configurations and start polling
  useEffect(() => {
    fetchContainers();
    fetchNetworkConfig();
    const savedLayout = localStorage.getItem(`akal-lab-graph-layout-${projectId}`);
    if (savedLayout) {
      try {
        positionsRef.current = JSON.parse(savedLayout);
      } catch (err) {
        console.error(err);
      }
    }

    const timer = setInterval(() => {
      fetchContainers();
      fetchNetworkConfig();
    }, 4000);
    return () => clearInterval(timer);
  }, [projectId, fetchContainers, fetchNetworkConfig]);

  // Sync container data into React Flow nodes when containers change
  useEffect(() => {
    // Assign freshly created containers to the subnet they were dropped in
    let workingConfig = networkConfig;
    containers.forEach(c => {
      const subnetId = dropSubnetsRef.current[c.name];
      if (subnetId) {
        workingConfig = assignNodeToSubnet(workingConfig, c.id, subnetId);
        delete dropSubnetsRef.current[c.name];
      }
    });

    if (workingConfig !== networkConfig) {
      saveNetworkConfig(workingConfig);
    }
    const nodeSubnetMap = workingConfig.nodeSubnetMap;

    setNodes(prevNodes => {
      // 1. Map Subnet nodes
      const subnetNodes = networkConfig.subnets.map(subnet => {
        const existing = prevNodes.find(n => n.id === subnet.id);
        return {
          ...existing,
          id: subnet.id,
          type: 'subnet',
          parentId: undefined,
          position: subnet.position,
          style: { width: subnet.width, height: subnet.height },
          data: {
            id: subnet.id,
            name: subnet.name,
            type: subnet.type,
            cidr: subnet.cidr,
            width: subnet.width,
            height: subnet.height,
            columns: subnet.columns || 2,
            rows: subnet.rows || 1,
            onManageRoutes: (id: string, name: string) => {
              setInspector({ kind: 'subnet-routes', id, name });
            },
            onDelete: handleDeleteSubnet,
            onResize: handleSubnetResize
          }
        };
      });

      // 2. Map container nodes
      const containerNodes = containers.filter(c => !c.isAsgInstance).map((c, index) => {
        const existing = prevNodes.find(n => n.id === c.id);
        const defaultX = 150 + (index % 3) * 280;
        const defaultY = 150 + Math.floor(index / 3) * 220;

        const savedPos = positionsRef.current[c.id];
        // dropPositionsRef is keyed by name: at drop time the container does
        // not exist yet, so the name is the only handle. Consume it here and
        // re-key the position by id like everything else.
        const dropPos = dropPositionsRef.current[c.name];
        if (dropPos) {
          positionsRef.current[c.id] = dropPos;
          delete dropPositionsRef.current[c.name];
        }

        const parentId = nodeSubnetMap[c.id] || undefined;
        const isDragging = draggingNodeIdRef.current === c.id;

        let position = dropPos || savedPos || existing?.position || { x: defaultX, y: defaultY };

        // Auto-layout grid for subnet children (if not currently dragging)
        if (parentId && parentId.startsWith('subnet-') && !isDragging) {
          const subnet = networkConfig.subnets.find(s => s.id === parentId);

          const occupiedCells = containers
            .filter(node => !node.isAsgInstance && node.id !== c.id && nodeSubnetMap[node.id] === parentId)
            .map(node => positionsRef.current[node.id])
            .filter((pos): pos is { x: number; y: number } => !!pos)
            .map(positionToCell);

          position = resolveSubnetChildPosition({
            savedPos: positionsRef.current[c.id],
            columns: subnet?.columns || 2,
            rows: subnet?.rows || 1,
            occupiedCells
          });
          positionsRef.current[c.id] = position;
        }

        const nodeType = c.type || 'ubuntu';
        const subnet = parentId ? networkConfig.subnets.find(s => s.id === parentId) : undefined;
        const subnetType = subnet?.type || 'private';

        const nodeConfig = nodeType === 'loadbalancer' ? {
          loadBalancerAlgorithm: networkConfig.loadBalancerAlgorithms?.[c.id],
          loadBalancerTargets: networkConfig.loadBalancerTargets?.[c.id],
          loadBalancerTargetPort: networkConfig.loadBalancerTargetPorts?.[c.id],
        } : undefined;

        const asgConfig = nodeType === 'autoscalinggroup' ? networkConfig.asgs?.[c.id] : undefined;
        let parentName = '';
        if (asgConfig && asgConfig.parentId) {
          const parentNode = containers.find(tc => tc.id === asgConfig.parentId);
          if (parentNode) parentName = parentNode.name;
        }
        const instanceCount = containers.filter(tc => tc.asgId === c.id && tc.isAsgInstance).length;
 
        return {
          ...existing,
          id: c.id,
          type: nodeType,
          parentId,
          position,
          data: {
            id: c.id,
            name: c.name,
            state: c.state,
            status: c.status,
            lastError: opErrors[c.id],
            port: c.port,
            ip: c.ip || networkConfig.nodeIpMap?.[c.id] || 'pending',
            subnetType,
            config: nodeConfig,
            asgConfig: asgConfig ? { ...asgConfig, parentName } : undefined,
            instanceCount,
            onStart: startContainer,
            onStop: stopContainer,
            onDelete: (id: string) => {
              const usingAsgs = Object.keys(networkConfig?.asgs || {}).filter(asgId => networkConfig?.asgs?.[asgId]?.parentId === id);
              const hasActiveAsg = usingAsgs.some(asgId => {
                const container = containers.find(c => c.id === asgId);
                return container && container.state === 'running';
              });
              if (hasActiveAsg) {
                showNotification({
                  type: 'error',
                  message: `Cannot delete node: it is used as a template by an active Auto Scaling Group. Please stop the ASG first.`
                });
                return;
              }
              setDeleteTarget(id);
            },
            onTerminalOpen: (nodeType === 'loadbalancer' || nodeType === 'autoscalinggroup') ? () => {} : onTerminalOpen,
            onInspect: (id: string, name: string) => {
              const kind = INSPECTOR_KIND_BY_NODE_TYPE[nodeType];
              if (kind) setInspector({ kind, id, name });
            },
            onSecurityGroupOpen: (id: string, name: string) => {
              setInspector({ kind: 'security-group', id, name, nodeType });
            },
            onRename: (id: string, currentName: string) => {
              setRenamingNode({ id, currentName });
            }
          },
        };
      });

      return [...subnetNodes, ...containerNodes];
    });

    // Save current positions (including auto-placed new nodes) to localStorage
    localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positionsRef.current));
  }, [projectId, containers, opErrors, startContainer, stopContainer, onTerminalOpen, setNodes, networkConfig, saveNetworkConfig, handleDeleteSubnet, handleSubnetResize, draggingNodeIdRef, showNotification]);



  const saveGraphLocally = () => {
    const currentPositions: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      if (n.type !== 'subnet') {
        currentPositions[n.id] = { x: n.position.x, y: n.position.y };
      }
    });
    positionsRef.current = currentPositions;
    localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(currentPositions));
    showToast(t('toasts.graphSaved'));
  };

  const handleCreateNode = async (name: string) => {
    const exists = containers.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      showNotification({
        type: 'error',
        message: t('toasts.nodeExists', { name })
      });
      return;
    }

    const type = dropState?.type || 'ubuntu';
    const position = dropState?.position;

    if (position) {
      dropPositionsRef.current[name] = position;
    }

    let targetSubnetId: string | undefined = undefined;
    if (pendingSubnetIdRef.current) {
      dropSubnetsRef.current[name] = pendingSubnetIdRef.current;
      targetSubnetId = pendingSubnetIdRef.current;
      pendingSubnetIdRef.current = null;
    }

    try {
      await createContainer(name, type, targetSubnetId);
    } finally {
      setShowCreateModal(false);
      setDropState(null);
    }
  };

  const handleCancelCreate = () => {
    setShowCreateModal(false);
    setDropState(null);
    pendingSubnetIdRef.current = null;
  };

  const handleRenameNode = async (newName: string) => {
    if (!renamingNode) return;
    const { id, currentName } = renamingNode;
    const trimmedNewName = newName.trim();

    // Guard against renaming to the same name
    if (trimmedNewName.toLowerCase() === currentName.toLowerCase()) {
      showNotification({ type: 'warning', message: t('toasts.nodeAlreadyNamed', { name: currentName }) });
      setRenamingNode(null);
      return;
    }

    // Guard against duplicate names (same check used at creation time)
    const exists = containers.some(
      c => c.name.toLowerCase() === trimmedNewName.toLowerCase() && c.id !== id
    );
    if (exists) {
      showNotification({ type: 'error', message: t('toasts.nodeExists', { name: trimmedNewName }) });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${id}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: trimmedNewName }),
      });
      if (!res.ok) {
        let message = t('toasts.renameFailedGeneric');
        try {
          const data = await res.json();
          if (typeof data?.error === 'string' && data.error.trim()) {
            message = data.error;
          }
        } catch {
          // Keep the generic message when the server returns a non-JSON body.
        }
        showNotification({ type: 'error', message });
        return;
      }
    } catch {
      showNotification({ type: 'error', message: t('toasts.renameFailedServer') });
      return;
    }

    setRenamingNode(null);
    showToast(t('toasts.nodeRenamed', { name: trimmedNewName }));
    await fetchContainers();
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    
    try {
      const success = await deleteContainer(id);
      if (success) {
        delete positionsRef.current[id];
        localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positionsRef.current));

        saveNetworkConfig(removeNodeFromConfig(networkConfig, id));
      }
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div style={styles.wrapper}>
      <CanvasTopbar
        projectName={projectName}
        loading={loading}
        creating={creating}
        onBack={onBackToProjects}
        onRefresh={fetchContainers}
        onSave={saveGraphLocally}
        onConfigureVpc={() => setShowVpcSettings(true)}
        onSimulateTraffic={() => setShowTrafficSimulator(true)}
        onToggleLearning={() => setShowLearning(v => !v)}
      />

      <div style={styles.bodyWrapper}>
        {showLearning && (
          <LearningPanel
            projectId={projectId}
            onClose={() => setShowLearning(false)}
            containers={containers}
            networkConfig={networkConfig}
          />
        )}

        {/* Main React Flow Workspace */}
        <div
          style={styles.canvasContainer}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {/* Floating VPC Header */}
          <div style={styles.floatingHeader} className="glass">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, color: '#111827' }}>Project:</span>
              <span style={{ color: '#374151' }}>{projectName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid rgba(0, 0, 0, 0.1)', paddingLeft: '12px' }}>
              <span style={{ fontWeight: 600, color: '#111827' }}>VPC:</span>
              <span style={{ color: '#2563EB', fontWeight: 500 }}>{networkConfig.vpcConfig.name}</span>
              <span style={{ fontSize: '11px', color: '#4B5563', backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                {networkConfig.vpcConfig.cidr}
              </span>
            </div>
          </div>

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} color="#C0C0C0" gap={24} size={1.5} />
            <Controls />
          </ReactFlow>
        </div>

        <NodeLibrary />
      </div>

      <CanvasFooter containers={containers} />

      <CanvasModals
        projectId={projectId}
        containers={containers}
        networkConfig={networkConfig}
        saveNetworkConfig={saveNetworkConfig}
        triggerArchitectureAudit={triggerArchitectureAudit}
        showToast={showToast}
        fetchContainers={fetchContainers}
        createNode={showCreateModal ? {
          type: dropState?.type || 'ubuntu',
          onSubmit: handleCreateNode,
          onCancel: handleCancelCreate,
        } : null}
        deleteNode={deleteTarget ? {
          onConfirm: handleDeleteConfirmed,
          onCancel: () => setDeleteTarget(null),
        } : null}
        renameNode={renamingNode ? {
          currentName: renamingNode.currentName,
          onSubmit: handleRenameNode,
          onCancel: () => setRenamingNode(null),
        } : null}
        inspector={inspector}
        onCloseInspector={closeInspector}
        vpcSettings={showVpcSettings ? { onClose: () => setShowVpcSettings(false) } : null}
        trafficSimulator={showTrafficSimulator ? { onClose: () => setShowTrafficSimulator(false) } : null}
      />

      {dockerUnavailable && <DockerUnavailableBanner />}

      {toast && (
        <ToastNotification type={toast.type} message={toast.message} onDismiss={dismissToast} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    position: 'relative',
  },
  bodyWrapper: {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    height: 'calc(100% - 57px)',
    width: '100%',
    overflow: 'hidden',
  },
  canvasContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  floatingHeader: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    borderRadius: 8,
    border: '1px solid rgba(229, 231, 235, 0.5)',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  },
};
