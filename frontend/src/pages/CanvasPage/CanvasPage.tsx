import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, BackgroundVariant, useNodesState } from '@xyflow/react';
import type { Node, Edge, ReactFlowInstance, Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import UbuntuNode from '../../features/nodes/UbuntuNode/UbuntuNode';
import NatNode from '../../features/nodes/NatNode/NatNode';
import NatGatewayModal from '../../features/nodes/NatNode/NatGatewayModal';
import PostgresNode from '../../features/nodes/PostgresNode/PostgresNode';
import PostgresModal from '../../features/nodes/PostgresNode/PostgresModal';
import NoSqlNode from '../../features/nodes/NoSqlNode/NoSqlNode';
import NoSqlModal from '../../features/nodes/NoSqlNode/NoSqlModal';
import RedisNode from '../../features/nodes/RedisNode/RedisNode';
import RedisModal from '../../features/nodes/RedisNode/RedisModal';

import LoadBalancerNode from '../../features/nodes/LoadBalancerNode/LoadBalancerNode';
import LoadBalancerModal from '../../features/nodes/LoadBalancerNode/LoadBalancerModal';
import AsgNode from '../../features/nodes/AsgNode/AsgNode';
import AsgModal from '../../features/nodes/AsgNode/AsgModal';
import NodeLibrary from './components/NodeLibrary';
import { useContainers } from '../../shared/hooks/useContainers';
import { useToast } from '../../shared/hooks/useToast';
import { ToastNotification } from '../../shared/components/Toast';
import { DockerUnavailableBanner } from '../../shared/components/DockerUnavailableBanner';
import InputModal from '../../shared/components/InputModal';
import ConfirmModal from '../../shared/components/ConfirmModal';
import CanvasTopbar from './components/CanvasTopbar';
import CanvasFooter from './components/CanvasFooter';

// Phase 3 Imports
import VpcNode from '../../features/nodes/VpcNode/VpcNode';
import SubnetNode from '../../features/nodes/SubnetNode/SubnetNode';
import RoutingTableModal from '../../features/nodes/SubnetNode/RoutingTableModal';
import SecurityGroupsModal from '../../features/nodes/SecurityGroups/SecurityGroupsModal';
import VpcModal from '../../features/nodes/VpcNode/VpcModal';
import ButtonEdge from './components/ButtonEdge';
import { API_BASE } from '../../shared/types';
import { useNetworkConfig } from './hooks/useNetworkConfig';
import {
  getAbsoluteCoordinates,
  findSubnetAtPoint,
  positionToCell,
  clampToCell,
  resolveSubnetChildPosition,
  subnetSize,
} from './utils/canvasGeometry';
import {
  addConnectionRule,
  parseEdgeId,
  removeEdgeRule,
  removeRulesForConnections,
  buildFirewallEdges,
} from './utils/securityRules';
import {
  autoGrowContainers,
  assignNodeToSubnet,
  removeNodeFromConfig,
  createSubnet,
} from './utils/networkConfigOps';

interface CanvasPageProps {
  projectId: string;
  projectName: string;
  onBackToProjects: () => void;
  onTerminalOpen: (id: string, name: string) => void;
}

export default function CanvasPage({ projectId, projectName, onBackToProjects, onTerminalOpen }: CanvasPageProps) {
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
  const [inspectingPostgres, setInspectingPostgres] = useState<{ id: string; name: string } | null>(null);
  const [inspectingNosql, setInspectingNosql] = useState<{ id: string; name: string } | null>(null);
  const [inspectingRedis, setInspectingRedis] = useState<{ id: string; name: string } | null>(null);

  const [inspectingNat, setInspectingNat] = useState<{ id: string; name: string } | null>(null);
  const [inspectingLoadBalancer, setInspectingLoadBalancer] = useState<{ id: string; name: string } | null>(null);
  const [inspectingAsg, setInspectingAsg] = useState<{ id: string; name: string } | null>(null);

  // Phase 3 Modal states
  const [inspectingSubnet, setInspectingSubnet] = useState<{ id: string; name: string } | null>(null);
  const [inspectingSecurityGroup, setInspectingSecurityGroup] = useState<{ id: string; name: string; type: string } | null>(null);

  // Rename modal state
  const [renamingNode, setRenamingNode] = useState<{ id: string; currentName: string } | null>(null);

  // Drag and drop tracking
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [dropState, setDropState] = useState<{ position: { x: number; y: number }; type: string } | null>(null);
  const dropPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const dropSubnetsRef = useRef<Record<string, string>>({});
  const pendingSubnetIdRef = useRef<string | null>(null);
  const dragStartPositionsRef = useRef<Record<string, { x: number; y: number; parentId?: string }>>({});
  const draggingNodeIdRef = useRef<string | null>(null);

  // React Flow managed nodes state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  // Ref to track saved positions (avoids re-render loops)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const { networkConfig, saveNetworkConfig, fetchNetworkConfig, triggerArchitectureAudit } =
    useNetworkConfig({ projectId, containers, showNotification });

  const [showVpcSettings, setShowVpcSettings] = useState(false);
  const [showTrafficSimulator, setShowTrafficSimulator] = useState(false);

  const nodeTypes = useMemo(() => ({
    ubuntu: UbuntuNode,
    postgres: PostgresNode,
    sql: PostgresNode,
    nosql: NoSqlNode,
    redis: RedisNode,
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
        message: 'Cannot delete subnet: Move or delete all nodes inside the subnet first.'
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
    showToast("Subnet deleted successfully");
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit, showNotification]);

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
              message: `Cannot shrink grid. You should remove the node with name '${node.name}' to be able to reduce the size`
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
  }, [networkConfig, containers, saveNetworkConfig, triggerArchitectureAudit, showNotification]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    const parsed = parseEdgeId(edgeId);
    if (!parsed) return;

    const newConfig = removeEdgeRule(networkConfig, parsed.sourceId, parsed.targetId, parsed.port);
    if (!newConfig) return;

    saveNetworkConfig(newConfig);
    showToast("Firewall connection removed");
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit]);

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
    showToast(`Security Group: Allowed ${result.port === 'ALL' ? 'all traffic' : `Port ${result.port}`} inbound from ${sourceName}`);
    triggerArchitectureAudit(result.config);
  }, [containers, networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit]);

  // Handle connection line deletion (removes matching firewall rule)
  const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    const newConfig = removeRulesForConnections(
      networkConfig,
      deletedEdges.map(edge => ({ source: edge.source, target: edge.target }))
    );
    if (!newConfig) return;

    saveNetworkConfig(newConfig);
    showToast("Firewall rule removed");
    triggerArchitectureAudit(newConfig);
  }, [networkConfig, saveNetworkConfig, showToast, triggerArchitectureAudit]);

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
              setInspectingSubnet({ id, name });
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
              if (nodeType === 'postgres' || nodeType === 'sql') {
                setInspectingPostgres({ id, name });
              } else if (nodeType === 'nosql') {
                setInspectingNosql({ id, name });
              } else if (nodeType === 'redis') {
                setInspectingRedis({ id, name });
              } else if (nodeType === 'nat') {
                setInspectingNat({ id, name });
              } else if (nodeType === 'loadbalancer') {
                setInspectingLoadBalancer({ id, name });
              } else if (nodeType === 'autoscalinggroup') {
                setInspectingAsg({ id, name });
              }
            },
            onSecurityGroupOpen: (id: string, name: string) => {
              setInspectingSecurityGroup({ id, name, type: nodeType });
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
  }, [projectId, containers, opErrors, startContainer, stopContainer, onTerminalOpen, setNodes, networkConfig, saveNetworkConfig, handleDeleteSubnet, handleSubnetResize]);



  // Track start position on drag start to allow rollback/reversion if drop is invalid
  const onNodeDragStart = useCallback((_event: any, node: Node) => {
    draggingNodeIdRef.current = node.id;
    dragStartPositionsRef.current[node.id] = {
      x: node.position.x,
      y: node.position.y,
      parentId: node.parentId
    };
  }, []);

  const onNodeDrag = useCallback((_event: any, draggedNode: Node) => {
    if (!reactFlowInstance) return;

    const currentNodes = reactFlowInstance.getNodes();

    // Calculate absolute coordinates of dragged node center
    let absX = draggedNode.position.x;
    let absY = draggedNode.position.y;
    if (draggedNode.parentId) {
      const parentPos = getAbsoluteCoordinates(draggedNode.parentId, currentNodes);
      absX += parentPos.x;
      absY += parentPos.y;
    }

    const nodeWidth = draggedNode.width || (draggedNode.type === 'subnet' ? 260 : 220);
    const nodeHeight = draggedNode.height || (draggedNode.type === 'subnet' ? 180 : 140);
    const centerX = absX + nodeWidth / 2;
    const centerY = absY + nodeHeight / 2;

    // Check intersection with subnets: hovering one is valid for a service
    // node, invalid for a subnet (no nesting).
    const center = { x: centerX, y: centerY };
    const hoveredSubnet = draggedNode.type !== 'subnet'
      ? findSubnetAtPoint(center, networkConfig.subnets)
      : findSubnetAtPoint(center, networkConfig.subnets, draggedNode.id);
    const hoveredId = hoveredSubnet?.id ?? null;
    const isValid = !!hoveredSubnet && draggedNode.type !== 'subnet';

    // Update real-time position in coordinates map for auto-growing calculations
    const tempNodeSubnetMap = { ...networkConfig.nodeSubnetMap };

    // If we are hovering a valid container, assume it's parented temporarily for sizing check
    if (hoveredId && isValid) {
      tempNodeSubnetMap[draggedNode.id] = hoveredId;
    } else if (draggedNode.type !== 'subnet') {
      // Dragging service node outside of any container
      delete tempNodeSubnetMap[draggedNode.id];
    }





    const tempConfig = {
      ...networkConfig,
      nodeSubnetMap: tempNodeSubnetMap
    };

    const grownConfig = autoGrowContainers(tempConfig);

    setNodes(prev => prev.map(n => {
      // Apply grew sizes to subnets
      if (n.type === 'subnet') {
        const subnet = grownConfig.subnets.find(s => s.id === n.id);
        const isHoverTarget = n.id === hoveredId;
        return {
          ...n,
          style: { ...n.style, width: subnet?.width, height: subnet?.height },
          data: {
            ...n.data,
            hoverStatus: isHoverTarget ? (isValid ? 'valid' : 'invalid') : null
          }
        };
      }
      return n;
    }));

  }, [reactFlowInstance, networkConfig, containers, setNodes]);

  // Save position to ref and localStorage when drag ends (auto-save with overlapping logic)
  const onNodeDragStop = useCallback((_event: any, draggedNode: Node) => {
    draggingNodeIdRef.current = null;
    if (!reactFlowInstance) return;

    const currentNodes = reactFlowInstance.getNodes();

    // Reset all hoverStatus
    setNodes(prev => prev.map(n => {
      if (n.data && n.data.hoverStatus) {
        return { ...n, data: { ...n.data, hoverStatus: null } };
      }
      return n;
    }));

    // Calculate final absolute coordinates of dragged node
    let absX = draggedNode.position.x;
    let absY = draggedNode.position.y;
    if (draggedNode.parentId) {
      const parentPos = getAbsoluteCoordinates(draggedNode.parentId, currentNodes);
      absX += parentPos.x;
      absY += parentPos.y;
    }

    const revertNode = (message: string) => {
      showNotification({ type: 'error', message });
      const original = dragStartPositionsRef.current[draggedNode.id];
      if (original) {
        setNodes(prev => prev.map(n => {
          if (n.id === draggedNode.id) {
            return {
              ...n,
              position: { x: original.x, y: original.y },
              parentId: original.parentId
            };
          }
          return n;
        }));
      }
    };

    if (draggedNode.type === 'subnet') {
      const subnetWidth = 260;
      const subnetHeight = 180;
      const subnetCenter = { x: absX + subnetWidth / 2, y: absY + subnetHeight / 2 };

      // Check if dropped inside another subnet
      const insideAnotherSubnet = !!findSubnetAtPoint(subnetCenter, networkConfig.subnets, draggedNode.id);

      if (insideAnotherSubnet) {
        revertNode('Invalid placement: Subnets cannot be nested inside other subnets.');
        return;
      }

      const updatedSubnets = networkConfig.subnets.map(s => {
        if (s.id === draggedNode.id) {
          return {
            ...s,
            position: { x: absX, y: absY }
          };
        }
        return s;
      });

      const newConfig = { ...networkConfig, subnets: updatedSubnets };
      saveNetworkConfig(newConfig);
      triggerArchitectureAudit(newConfig);
    }
    else {
      // Container/Service node
      const nodeCenter = { x: absX + 110, y: absY + 70 };
      const targetSubnet = findSubnetAtPoint(nodeCenter, networkConfig.subnets);
      const targetSubnetId = targetSubnet?.id ?? null;

      const original = dragStartPositionsRef.current[draggedNode.id];
      const oldParentId = original?.parentId;
      const newParentId = targetSubnetId || undefined;

      if (oldParentId !== newParentId) {
        const oldSubnet = networkConfig.subnets.find(s => s.id === oldParentId);
        const newSubnet = networkConfig.subnets.find(s => s.id === newParentId);

        if (oldParentId && oldParentId.startsWith('subnet-')) {
          showNotification({ type: 'warning', message: `Node "${draggedNode.data.name}" removed from Subnet "${oldSubnet?.name || 'Subnet'}"` });
        }

        if (newParentId && newParentId.startsWith('subnet-')) {
          showNotification({ type: 'success', message: `Node "${draggedNode.data.name}" added to Subnet "${newSubnet?.name || 'Subnet'}"` });
        }
      }

      if (!targetSubnet) {
        // Revert container node drag to its original subnet position
        showNotification({ type: 'warning', message: 'Nodes must reside within a subnet.' });
        const original = dragStartPositionsRef.current[draggedNode.id];
        if (original) {
          setNodes(prev => prev.map(n => {
            if (n.id === draggedNode.id) {
              return {
                ...n,
                position: { x: original.x, y: original.y },
                parentId: original.parentId
              };
            }
            return n;
          }));
        }
        return;
      }

      positionsRef.current[draggedNode.id] = clampToCell(
        { x: absX - targetSubnet.position.x, y: absY - targetSubnet.position.y },
        targetSubnet.columns || 2,
        targetSubnet.rows || 1
      );
      localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positionsRef.current));

      const newConfig = assignNodeToSubnet(networkConfig, draggedNode.id, targetSubnet.id);
      saveNetworkConfig(newConfig);
      triggerArchitectureAudit(newConfig);
    }
  }, [reactFlowInstance, networkConfig, projectId, saveNetworkConfig, setNodes, triggerArchitectureAudit, showNotification]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    const blockedNode = deleted.find(node => {
      const usingAsgs = Object.keys(networkConfig?.asgs || {}).filter(asgId => networkConfig?.asgs?.[asgId]?.parentId === node.id);
      return usingAsgs.some(asgId => {
        const container = containers.find(c => c.id === asgId);
        return container && container.state === 'running';
      });
    });

    if (blockedNode) {
      showNotification({
        type: 'error',
        message: `Cannot delete node "${blockedNode.data?.name || 'Node'}": it is used as a template by an active Auto Scaling Group. Please stop the ASG first.`
      });
      fetchContainers();
      return;
    }

    let updatedSubnets = [...networkConfig.subnets];
    const updatedNodeSubnetMap = { ...networkConfig.nodeSubnetMap };
    const updatedSecurityGroups = { ...networkConfig.nodeSecurityGroups };
    const updatedNodeIpMap = { ...networkConfig.nodeIpMap || {} };
    let configChanged = false;

    deleted.forEach(node => {
      if (node.type === 'subnet') {
        updatedSubnets = updatedSubnets.filter(s => s.id !== node.id);
        Object.keys(updatedNodeSubnetMap).forEach(nodeId => {
          if (updatedNodeSubnetMap[nodeId] === node.id) {
            delete updatedNodeSubnetMap[nodeId];
            delete updatedNodeIpMap[nodeId];
          }
        });
        configChanged = true;
      }
      // If it's a node being deleted directly
      if (updatedNodeSubnetMap[node.id]) {
        delete updatedNodeSubnetMap[node.id];
        delete updatedNodeIpMap[node.id];
        configChanged = true;
      }
    });

    if (configChanged || deleted.length > 0) {
      saveNetworkConfig({
        ...networkConfig,
        subnets: updatedSubnets,
        nodeSubnetMap: updatedNodeSubnetMap,
        nodeSecurityGroups: updatedSecurityGroups,
        nodeIpMap: updatedNodeIpMap
      });
    }
  }, [networkConfig, saveNetworkConfig, containers, fetchContainers, showNotification]);

  const saveGraphLocally = () => {
    const currentPositions: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      if (n.type !== 'subnet') {
        currentPositions[n.id] = { x: n.position.x, y: n.position.y };
      }
    });
    positionsRef.current = currentPositions;
    localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(currentPositions));
    showToast('Graph layout saved successfully');
  };

  const handleCreateNode = async (name: string) => {
    const exists = containers.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      showNotification({
        type: 'error',
        message: `A node named "${name}" already exists in this project.`
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
      showNotification({ type: 'warning', message: `The node is already named "${currentName}".` });
      setRenamingNode(null);
      return;
    }

    // Guard against duplicate names (same check used at creation time)
    const exists = containers.some(
      c => c.name.toLowerCase() === trimmedNewName.toLowerCase() && c.id !== id
    );
    if (exists) {
      showNotification({ type: 'error', message: `A node named "${trimmedNewName}" already exists in this project.` });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/containers/${id}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: trimmedNewName }),
      });
      if (!res.ok) {
        let message = 'Rename failed.';
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
      showNotification({ type: 'error', message: 'Rename failed: could not reach the server.' });
      return;
    }

    setRenamingNode(null);
    showToast(`Node renamed to "${trimmedNewName}"`);
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

  // React Flow Drag-and-Drop handlers
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (type === 'subnet-public' || type === 'subnet-private') {
        const newSubnet = createSubnet(
          type === 'subnet-public' ? 'public' : 'private',
          position,
          networkConfig.vpcConfig.cidr,
          networkConfig.subnets.length
        );

        // Check if dropped inside another subnet
        const subnetCenter = { x: position.x + newSubnet.width / 2, y: position.y + newSubnet.height / 2 };
        if (findSubnetAtPoint(subnetCenter, networkConfig.subnets)) {
          showNotification({ type: 'error', message: 'Invalid placement: Subnets cannot be nested inside other subnets.' });
          return;
        }

        const newConfig = {
          ...networkConfig,
          subnets: [...networkConfig.subnets, newSubnet]
        };
        saveNetworkConfig(newConfig);
        triggerArchitectureAudit(newConfig);
      } else {
        const nodeCenter = { x: position.x + 110, y: position.y + 70 };
        const targetSubnet = findSubnetAtPoint(nodeCenter, networkConfig.subnets);

        if (!targetSubnet) {
          showNotification({ type: 'error', message: 'Nodes must reside within a subnet.' });
          return;
        }

        const finalDropPos = clampToCell(
          { x: position.x - targetSubnet.position.x, y: position.y - targetSubnet.position.y },
          targetSubnet.columns || 2,
          targetSubnet.rows || 1
        );

        setDropState({ position: finalDropPos, type });
        pendingSubnetIdRef.current = targetSubnet.id;
        setShowCreateModal(true);
      }
    },
    [reactFlowInstance, networkConfig, saveNetworkConfig, showNotification, triggerArchitectureAudit]
  );



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
      />

      <div style={styles.bodyWrapper}>
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

      {/* Modals */}
      {showCreateModal && (
        <InputModal
          title={
            (dropState?.type === 'postgres' || dropState?.type === 'sql')
              ? "Create SQL Database Node"
              : dropState?.type === 'nosql'
                ? "Create NoSQL Database Node"
                : dropState?.type === 'redis'
                  ? "Create Cache Store Node"
                : dropState?.type === 'nat'
                  ? "Create NAT Gateway Node"
                  : dropState?.type === 'loadbalancer'
                    ? "Create Load Balancer Node"
                    : dropState?.type === 'autoscalinggroup'
                      ? "Create Auto Scaling Group Node"
                      : "Create Ubuntu Node"
          }
          label="Give your new container a descriptive name."
          placeholder={
            (dropState?.type === 'postgres' || dropState?.type === 'sql')
              ? "e.g. sql-1"
              : dropState?.type === 'nosql'
                ? "e.g. nosql-1"
                : dropState?.type === 'redis'
                  ? "e.g. redis-1"
                : dropState?.type === 'nat'
                  ? "e.g. nat-1"
                  : dropState?.type === 'loadbalancer'
                    ? "e.g. alb-1"
                    : dropState?.type === 'autoscalinggroup'
                      ? "e.g. asg-1"
                      : "e.g. server-1"
          }
          maxLength={20}
          restrictPattern={/[^a-zA-Z0-9-]/g}
          defaultValue={
            (() => {
              const type = dropState?.type || 'ubuntu';
              const prefix =
                (type === 'postgres' || type === 'sql')
                  ? 'sql-'
                  : type === 'nosql'
                    ? 'nosql-'
                    : type === 'redis'
                      ? 'redis-'
                    : type === 'nat'
                      ? 'nat-'
                      : type === 'loadbalancer'
                        ? 'alb-'
                        : type === 'autoscalinggroup'
                          ? 'asg-'
                          : 'srv-';
              let suffix = 1;
              while (containers.some(c => c.name === `${prefix}${suffix}`)) {
                suffix++;
              }
              return `${prefix}${suffix}`;
            })()
          }
          submitText="Create Node"
          onSubmit={handleCreateNode}
          onCancel={handleCancelCreate}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Container"
          message="This will permanently stop and remove this container. This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {renamingNode && (
        <InputModal
          title="Rename Node"
          label="Enter a new name for this node."
          placeholder="e.g. api-gateway"
          maxLength={20}
          restrictPattern={/[^a-zA-Z0-9-]/g}
          defaultValue={renamingNode.currentName}
          submitText="Rename"
          onSubmit={handleRenameNode}
          onCancel={() => setRenamingNode(null)}
        />
      )}

      {inspectingPostgres && (
        <PostgresModal
          containerId={inspectingPostgres.id}
          nodeName={inspectingPostgres.name}
          projectId={projectId}
          onClose={() => setInspectingPostgres(null)}
        />
      )}

      {inspectingNosql && (
        <NoSqlModal
          containerId={inspectingNosql.id}
          nodeName={inspectingNosql.name}
          projectId={projectId}
          onClose={() => setInspectingNosql(null)}
        />
      )}

      {inspectingRedis && (
        <RedisModal
          containerId={inspectingRedis.id}
          nodeName={inspectingRedis.name}
          projectId={projectId}
          onClose={() => setInspectingRedis(null)}
        />
      )}

      {inspectingNat && (
        <NatGatewayModal
          nodeName={inspectingNat.name}
          ipAddress={containers.find(c => c.id === inspectingNat.id)?.ip || networkConfig.nodeIpMap?.[inspectingNat.id]}
          state={containers.find(c => c.id === inspectingNat.id)?.state || 'stopped'}
          onClose={() => setInspectingNat(null)}
        />
      )}

       {inspectingLoadBalancer && (
        <LoadBalancerModal
          containerId={inspectingLoadBalancer.id}
          nodeName={inspectingLoadBalancer.name}
          ipAddress={containers.find(c => c.id === inspectingLoadBalancer.id)?.ip || networkConfig.nodeIpMap?.[inspectingLoadBalancer.id]}
          port={containers.find(c => c.id === inspectingLoadBalancer.id)?.port}
          state={containers.find(c => c.id === inspectingLoadBalancer.id)?.state || 'stopped'}
          config={{
            loadBalancerAlgorithm: networkConfig.loadBalancerAlgorithms?.[inspectingLoadBalancer.id],
            loadBalancerTargets: networkConfig.loadBalancerTargets?.[inspectingLoadBalancer.id],
            loadBalancerTargetPort: networkConfig.loadBalancerTargetPorts?.[inspectingLoadBalancer.id],
            loadBalancerRoutingRules: networkConfig.loadBalancerRoutingRules?.[inspectingLoadBalancer.id]
          }}
          allNodes={containers}
          onClose={() => setInspectingLoadBalancer(null)}
          onSaveConfig={async (algorithm, targets, targetPort, routingRules) => {
            const updatedAlgorithms = {
              ...(networkConfig.loadBalancerAlgorithms || {}),
              [inspectingLoadBalancer.id]: algorithm
            };
            const updatedTargets = {
              ...(networkConfig.loadBalancerTargets || {}),
              [inspectingLoadBalancer.id]: targets
            };
            const updatedTargetPorts = {
              ...(networkConfig.loadBalancerTargetPorts || {}),
              [inspectingLoadBalancer.id]: targetPort
            };
            const updatedRoutingRules = {
              ...(networkConfig.loadBalancerRoutingRules || {}),
              [inspectingLoadBalancer.id]: routingRules
            };
            const newConfig = {
              ...networkConfig,
              loadBalancerAlgorithms: updatedAlgorithms,
              loadBalancerTargets: updatedTargets,
              loadBalancerTargetPorts: updatedTargetPorts,
              loadBalancerRoutingRules: updatedRoutingRules
            };
            await saveNetworkConfig(newConfig);
            showToast("Load Balancer configuration applied");
            triggerArchitectureAudit(newConfig);
          }}
        />
      )}

      {inspectingAsg && (
        <AsgModal
          asgId={inspectingAsg.id}
          nodeName={inspectingAsg.name}
          projectId={projectId}
          config={networkConfig}
          containers={containers}
          onClose={() => setInspectingAsg(null)}
          onSaveConfig={async (asgConfig) => {
            const updatedAsgs = {
              ...(networkConfig.asgs || {}),
              [inspectingAsg.id]: asgConfig
            };
            const newConfig = {
              ...networkConfig,
              asgs: updatedAsgs
            };
            await saveNetworkConfig(newConfig);
            showToast("Auto Scaling Group configuration saved");
            triggerArchitectureAudit(newConfig);
          }}
          onRefreshContainers={fetchContainers}
        />
      )}

      {/* Phase 3 Modals */}
      {inspectingSubnet && (
        <RoutingTableModal
          subnetId={inspectingSubnet.id}
          subnetName={inspectingSubnet.name}
          routes={networkConfig.subnets.find(s => s.id === inspectingSubnet.id)?.routes || []}
          natGateways={containers.filter(c => c.type === 'nat').map(c => c.name)}
          onClose={() => setInspectingSubnet(null)}
          onSave={async (updatedRoutes) => {
            const updatedSubnets = networkConfig.subnets.map(s => {
              if (s.id === inspectingSubnet.id) {
                return { ...s, routes: updatedRoutes };
              }
              return s;
            });
            await saveNetworkConfig({ ...networkConfig, subnets: updatedSubnets });
          }}
        />
      )}

      {inspectingSecurityGroup && (
        <SecurityGroupsModal
          nodeId={inspectingSecurityGroup.id}
          nodeName={inspectingSecurityGroup.name}
          nodeType={inspectingSecurityGroup.type}
          allNodes={containers}
          allSubnets={networkConfig.subnets.map(s => ({ id: s.id, name: s.name }))}
          rules={networkConfig.nodeSecurityGroups[inspectingSecurityGroup.id] || []}
          onClose={() => setInspectingSecurityGroup(null)}
          onSaveRules={(rules) => {
            const updatedSecurityGroups = {
              ...networkConfig.nodeSecurityGroups,
              [inspectingSecurityGroup.id]: rules
            };
            const newConfig = { ...networkConfig, nodeSecurityGroups: updatedSecurityGroups };
            saveNetworkConfig(newConfig);
            triggerArchitectureAudit(newConfig);
          }}
        />
      )}

      {showVpcSettings && (
        <VpcModal
          vpcConfig={networkConfig.vpcConfig}
          subnets={networkConfig.subnets}
          nodes={containers}
          nodeSecurityGroups={networkConfig.nodeSecurityGroups}
          nodeSubnetMap={networkConfig.nodeSubnetMap}
          onClose={() => setShowVpcSettings(false)}
          onSaveVpcConfig={(config) => {
            const newConfig = { ...networkConfig, vpcConfig: config };
            saveNetworkConfig(newConfig);
            setShowVpcSettings(false);
            showToast("VPC configuration saved");
            triggerArchitectureAudit(newConfig);
          }}
          initialTab="info"
        />
      )}

      {showTrafficSimulator && (
        <VpcModal
          vpcConfig={networkConfig.vpcConfig}
          subnets={networkConfig.subnets}
          nodes={containers}
          nodeSecurityGroups={networkConfig.nodeSecurityGroups}
          nodeSubnetMap={networkConfig.nodeSubnetMap}
          onClose={() => setShowTrafficSimulator(false)}
          onSaveVpcConfig={(config) => {
            const newConfig = { ...networkConfig, vpcConfig: config };
            saveNetworkConfig(newConfig);
            setShowTrafficSimulator(false);
            showToast("VPC configuration saved");
            triggerArchitectureAudit(newConfig);
          }}
          initialTab="simulator"
        />
      )}

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
