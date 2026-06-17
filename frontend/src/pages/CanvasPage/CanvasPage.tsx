import { useEffect, useMemo, useCallback, useRef } from 'react';
import { ReactFlow, Background, Controls, BackgroundVariant, useNodesState } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import UbuntuNode from '../../features/nodes/UbuntuNode/UbuntuNode';
import PostgresNode from '../../features/nodes/PostgresNode/PostgresNode';
import PostgresModal from '../../features/nodes/PostgresNode/PostgresModal';
import MysqlNode from '../../features/nodes/MysqlNode/MysqlNode';
import MysqlModal from '../../features/nodes/MysqlNode/MysqlModal';
import NodeLibrary from './components/NodeLibrary';
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

  // Modal and inspector states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [inspectingPostgres, setInspectingPostgres] = useState<{ id: string; name: string } | null>(null);
  const [inspectingMysql, setInspectingMysql] = useState<{ id: string; name: string } | null>(null);

  // Drag and drop tracking
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [dropState, setDropState] = useState<{ position: { x: number; y: number }; type: string } | null>(null);
  const dropPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // React Flow managed nodes state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const edges: Edge[] = [];

  // Ref to track saved positions (avoids re-render loops)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const nodeTypes = useMemo(() => ({ 
    ubuntu: UbuntuNode,
    postgres: PostgresNode,
    mysql: MysqlNode
  }), []);

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
        const dropPos = dropPositionsRef.current[c.name];
        if (dropPos) {
          positionsRef.current[c.id] = dropPos;
          delete dropPositionsRef.current[c.name];
        }

        const position = existing?.position || dropPos || savedPos || { x: defaultX, y: defaultY };
        const nodeType = c.type || 'ubuntu';

        return {
          id: c.id,
          type: nodeType,
          position,
          data: {
            id: c.id,
            name: c.name,
            state: c.state,
            status: c.status,
            port: c.port,
            onStart: startContainer,
            onStop: stopContainer,
            onDelete: (id: string) => setDeleteTarget(id),
            onTerminalOpen: onTerminalOpen,
            onInspect: (id: string, name: string) => {
              if (nodeType === 'mysql') {
                setInspectingMysql({ id, name });
              } else {
                setInspectingPostgres({ id, name });
              }
            },
          },
        };
      });
    });
  }, [containers, startContainer, stopContainer, onTerminalOpen, setNodes]);

  // Save position to ref and localStorage when drag ends (auto-save)
  const onNodeDragStop = useCallback((_event: any, node: Node) => {
    positionsRef.current[node.id] = { x: node.position.x, y: node.position.y };
    localStorage.setItem(`akal-lab-graph-layout-${projectId}`, JSON.stringify(positionsRef.current));
  }, [projectId]);

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
    const type = dropState?.type || 'ubuntu';
    const position = dropState?.position;

    if (position) {
      dropPositionsRef.current[name] = position;
    }

    setDropState(null);
    await createContainer(name, type);
  };

  const handleCancelCreate = () => {
    setShowCreateModal(false);
    setDropState(null);
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

      setDropState({ position, type });
      setShowCreateModal(true);
    },
    [reactFlowInstance]
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
      />

      <div style={styles.bodyWrapper}>
        {/* Main React Flow Workspace */}
        <div 
          style={styles.canvasContainer}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
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
            dropState?.type === 'postgres' 
              ? "Create PostgreSQL Node" 
              : dropState?.type === 'mysql'
              ? "Create MySQL Node"
              : "Create Ubuntu Node"
          }
          label="Give your new container a descriptive name."
          placeholder={
            dropState?.type === 'postgres' 
              ? "e.g. pg-db, main-store" 
              : dropState?.type === 'mysql'
              ? "e.g. mysql-db, orders"
              : "e.g. web-server, api-gateway"
          }
          defaultValue={
            dropState?.type === 'postgres'
              ? `postgres-${containers.filter(c => c.type === 'postgres').length + 1}`
              : dropState?.type === 'mysql'
              ? `mysql-${containers.filter(c => c.type === 'mysql').length + 1}`
              : `node-${containers.filter(c => !c.type || c.type === 'ubuntu').length + 1}`
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

      {inspectingPostgres && (
        <PostgresModal
          containerId={inspectingPostgres.id}
          nodeName={inspectingPostgres.name}
          projectId={projectId}
          onClose={() => setInspectingPostgres(null)}
        />
      )}

      {inspectingMysql && (
        <MysqlModal
          containerId={inspectingMysql.id}
          nodeName={inspectingMysql.name}
          projectId={projectId}
          onClose={() => setInspectingMysql(null)}
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
  },
};
