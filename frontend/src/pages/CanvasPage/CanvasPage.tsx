import { useEffect, useMemo, useCallback, useRef } from 'react';
import { ReactFlow, Background, Controls, BackgroundVariant, useNodesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import UbuntuNode from '../../features/nodes/UbuntuNode/UbuntuNode';
import { useContainers } from '../../shared/hooks/useContainers';
import { useToast, ToastNotification } from '../../shared/components/Toast';
import InputModal from '../../shared/components/InputModal';
import ConfirmModal from '../../shared/components/ConfirmModal';
import CanvasTopbar from './components/CanvasTopbar';
import CanvasFooter from './components/CanvasFooter';
import { useState } from 'react';

interface CanvasPageProps {
  projectId: string;
  projectName: string;
  onBackToProjects: () => void;
  onTerminalOpen: (id: string, name: string) => void;
}

export default function CanvasPage({ projectId, projectName, onBackToProjects, onTerminalOpen }: CanvasPageProps) {
  const { toast, showToast, dismissToast } = useToast();

  const {
    containers,
    loading,
    creating,
    fetchContainers,
    createContainer,
    startContainer,
    stopContainer,
    deleteContainer,
  } = useContainers({ projectId, onToast: showToast });

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // React Flow managed nodes state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const edges: Edge[] = [];

  // Ref to track saved positions (avoids re-render loops)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const nodeTypes = useMemo(() => ({ ubuntu: UbuntuNode }), []);

  // Load saved positions and start polling
  useEffect(() => {
    fetchContainers();
    const savedLayout = localStorage.getItem(`akal-lab-graph-layout-${projectId}`);
    if (savedLayout) {
      try {
        positionsRef.current = JSON.parse(savedLayout);
      } catch (err) {
        console.error(err);
      }
    }

    const timer = setInterval(fetchContainers, 4000);
    return () => clearInterval(timer);
  }, [projectId, fetchContainers]);

  // Sync container data into React Flow nodes when containers change
  useEffect(() => {
    setNodes(prevNodes => {
      return containers.map((c, index) => {
        const existing = prevNodes.find(n => n.id === c.id);
        const defaultX = 150 + (index % 3) * 280;
        const defaultY = 150 + Math.floor(index / 3) * 220;
        const savedPos = positionsRef.current[c.id];
        const position = existing?.position || savedPos || { x: defaultX, y: defaultY };

        return {
          id: c.id,
          type: 'ubuntu',
          position,
          data: {
            id: c.id,
            name: c.name,
            state: c.state,
            status: c.status,
            onStart: startContainer,
            onStop: stopContainer,
            onDelete: (id: string) => setDeleteTarget(id),
            onTerminalOpen: onTerminalOpen,
          },
        };
      });
    });
  }, [containers, startContainer, stopContainer, onTerminalOpen, setNodes]);

  // Save position to ref when drag ends
  const onNodeDragStop = useCallback((_event: any, node: Node) => {
    positionsRef.current[node.id] = { x: node.position.x, y: node.position.y };
  }, []);

  const saveGraphLocally = () => {
    const currentPositions: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      currentPositions[n.id] = { x: n.position.x, y: n.position.y };
    });
    positionsRef.current = currentPositions;
    localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(currentPositions));
    showToast('Graph layout saved successfully');
  };

  const handleCreateNode = async (name: string) => {
    setShowCreateModal(false);
    await createContainer(name);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    const success = await deleteContainer(id);
    if (success) {
      delete positionsRef.current[id];
      localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positionsRef.current));
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
        onCreate={() => setShowCreateModal(true)}
      />

      {/* Main React Flow Workspace */}
      <div style={styles.canvasContainer}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} color="#C0C0C0" gap={24} size={1.5} />
          <Controls />
        </ReactFlow>
      </div>

      <CanvasFooter containers={containers} />

      {/* Modals */}
      {showCreateModal && (
        <InputModal
          title="Create Ubuntu Node"
          label="Give your new container a descriptive name."
          placeholder="e.g. web-server, api-gateway"
          defaultValue={`node-${containers.length + 1}`}
          submitText="Create Node"
          onSubmit={handleCreateNode}
          onCancel={() => setShowCreateModal(false)}
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

      {toast && (
        <ToastNotification message={toast} onDismiss={dismissToast} />
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
  canvasContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
};
