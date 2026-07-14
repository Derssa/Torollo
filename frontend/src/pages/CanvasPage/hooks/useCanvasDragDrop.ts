import { useCallback, useRef } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import type { ContainerData } from '../../../shared/types';
import type { NetworkConfig } from '../../../shared/types/network';
import { getAbsoluteCoordinates, findSubnetAtPoint, clampToCell } from '../utils/canvasGeometry';
import { autoGrowContainers, assignNodeToSubnet, createSubnet } from '../utils/networkConfigOps';

interface UseCanvasDragDropArgs {
  reactFlowInstance: ReactFlowInstance | null;
  networkConfig: NetworkConfig;
  containers: ContainerData[];
  positionsRef: MutableRefObject<Record<string, { x: number; y: number }>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  projectId: string;
  saveNetworkConfig: (config: NetworkConfig) => Promise<unknown>;
  triggerArchitectureAudit: (config: NetworkConfig) => void;
  showNotification: (notification: { type: 'error' | 'warning' | 'success'; message: string }) => void;
  fetchContainers: () => void;
  /** Bridge to the create-node modal: a service was dropped inside a subnet. */
  onRequestCreateNode: (drop: { position: { x: number; y: number }; type: string; subnetId: string }) => void;
}

/**
 * All React Flow drag/drop/delete handlers: reparenting nodes between
 * subnets (with revert on invalid placement), live hover feedback while
 * dragging, palette drops and the delete-key cascade.
 */
export function useCanvasDragDrop({
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
}: UseCanvasDragDropArgs) {
  const dragStartPositionsRef = useRef<Record<string, { x: number; y: number; parentId?: string }>>({});
  const draggingNodeIdRef = useRef<string | null>(null);

  // Track start position on drag start to allow rollback/reversion if drop is invalid
  const onNodeDragStart = useCallback((_event: unknown, node: Node) => {
    draggingNodeIdRef.current = node.id;
    dragStartPositionsRef.current[node.id] = {
      x: node.position.x,
      y: node.position.y,
      parentId: node.parentId
    };
  }, []);

  const onNodeDrag = useCallback((_event: unknown, draggedNode: Node) => {
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

    // Check intersection with subnets: hovering one is valid for a service
    // node, invalid for a subnet (no nesting).
    const center = { x: absX + nodeWidth / 2, y: absY + nodeHeight / 2 };
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

    const grownConfig = autoGrowContainers({
      ...networkConfig,
      nodeSubnetMap: tempNodeSubnetMap
    });

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
  }, [reactFlowInstance, networkConfig, setNodes]);

  // Save position to ref and localStorage when drag ends (auto-save with overlapping logic)
  const onNodeDragStop = useCallback((_event: unknown, draggedNode: Node) => {
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

    const revertNode = (message: { type: 'error' | 'warning'; text: string }) => {
      showNotification({ type: message.type, message: message.text });
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
      if (findSubnetAtPoint(subnetCenter, networkConfig.subnets, draggedNode.id)) {
        revertNode({ type: 'error', text: 'Invalid placement: Subnets cannot be nested inside other subnets.' });
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

      const original = dragStartPositionsRef.current[draggedNode.id];
      const oldParentId = original?.parentId;
      const newParentId = targetSubnet?.id;

      if (oldParentId !== newParentId) {
        const oldSubnet = networkConfig.subnets.find(s => s.id === oldParentId);

        if (oldParentId && oldParentId.startsWith('subnet-')) {
          showNotification({ type: 'warning', message: `Node "${draggedNode.data.name}" removed from Subnet "${oldSubnet?.name || 'Subnet'}"` });
        }

        if (newParentId && newParentId.startsWith('subnet-')) {
          showNotification({ type: 'success', message: `Node "${draggedNode.data.name}" added to Subnet "${targetSubnet?.name || 'Subnet'}"` });
        }
      }

      if (!targetSubnet) {
        // Revert container node drag to its original subnet position
        revertNode({ type: 'warning', text: 'Nodes must reside within a subnet.' });
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
  }, [reactFlowInstance, networkConfig, projectId, positionsRef, saveNetworkConfig, setNodes, triggerArchitectureAudit, showNotification]);

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
    const updatedNodeIpMap = { ...networkConfig.nodeIpMap || {} };

    deleted.forEach(node => {
      if (node.type === 'subnet') {
        updatedSubnets = updatedSubnets.filter(s => s.id !== node.id);
        Object.keys(updatedNodeSubnetMap).forEach(nodeId => {
          if (updatedNodeSubnetMap[nodeId] === node.id) {
            delete updatedNodeSubnetMap[nodeId];
            delete updatedNodeIpMap[nodeId];
          }
        });
      }
      // If it's a node being deleted directly
      if (updatedNodeSubnetMap[node.id]) {
        delete updatedNodeSubnetMap[node.id];
        delete updatedNodeIpMap[node.id];
      }
    });

    if (deleted.length > 0) {
      saveNetworkConfig({
        ...networkConfig,
        subnets: updatedSubnets,
        nodeSubnetMap: updatedNodeSubnetMap,
        nodeIpMap: updatedNodeIpMap
      });
    }
  }, [networkConfig, saveNetworkConfig, containers, fetchContainers, showNotification]);

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

        onRequestCreateNode({ position: finalDropPos, type, subnetId: targetSubnet.id });
      }
    },
    [reactFlowInstance, networkConfig, saveNetworkConfig, showNotification, triggerArchitectureAudit, onRequestCreateNode]
  );

  return {
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onNodesDelete,
    onDragOver,
    onDrop,
    draggingNodeIdRef,
  };
}
