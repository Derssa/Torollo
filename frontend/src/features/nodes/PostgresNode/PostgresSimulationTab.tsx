import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Server } from 'lucide-react';
import { inspectorStyles as styles } from '../components/inspectorStyles';

export interface PostgresSimLog {
  id: string;
  type: 'read' | 'write' | 'sys' | 'err';
  msg: string;
  time: string;
}

interface PostgresSimulationTabProps {
  /** Traffic only flows while the tab is actually shown. */
  visible: boolean;
  replicas: number;
  setReplicas: Dispatch<SetStateAction<number>>;
  partitions: number;
  simLogs: PostgresSimLog[];
  setSimLogs: Dispatch<SetStateAction<PostgresSimLog[]>>;
}

/**
 * Educational primary/replica/partition topology simulation: animated
 * read/write traffic, crash & automatic failover, replica promotion.
 * Replicas/partitions are owned by the modal (the details tab scales them).
 */
export default function PostgresSimulationTab({
  visible,
  replicas,
  setReplicas,
  partitions,
  simLogs,
  setSimLogs,
}: PostgresSimulationTabProps) {
  const { t } = useTranslation();

  // Zoom and Pan states for interactive topology viewport
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Floating query particles
  const [particles, setParticles] = useState<Array<{ id: string; target: 'primary' | 'replica'; index?: number; isWrite: boolean; isReplicationCopy?: boolean }>>([]);

  // Active highlighted target node for simulation flash
  const [activeHighlightNode, setActiveHighlightNode] = useState<string | null>(null);

  const [isPrimaryCrashed, setIsPrimaryCrashed] = useState(false);
  const [simMetrics, setSimMetrics] = useState({ reads: 0, writes: 0, errors: 0 });
  const [trafficActive, setTrafficActive] = useState(false);
  const [lastPartitionTarget, setLastPartitionTarget] = useState<number>(-1);

  // Automatic Replica promotion upon Primary database crash
  useEffect(() => {
    if (isPrimaryCrashed && replicas > 0) {
      const timer = setTimeout(() => {
        setIsPrimaryCrashed(false);
        setReplicas(prev => Math.max(0, prev - 1));
        setSimLogs(prev => [
          { id: Math.random().toString(), type: 'sys', msg: 'AUTOMATIC FAILOVER: Replica pool detected primary outage. Automatically elected Replica #1 to Primary. Primary database online.', time: new Date().toLocaleTimeString() },
          ...prev
        ]);
      }, 3500); // Failover duration 3.5 seconds
      return () => clearTimeout(timer);
    }
  }, [isPrimaryCrashed, replicas, setReplicas, setSimLogs]);

  // Interactive zoom & pan helper handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scaleChange = e.deltaY < 0 ? 0.08 : -0.08;
    setZoomScale(prev => Math.max(0.5, Math.min(2.0, prev + scaleChange)));
  };

  // Traffic simulation engine
  useEffect(() => {
    if (!trafficActive || !visible) return;

    const interval = setInterval(() => {
      const isWrite = Math.random() > 0.55;
      const timeStr = new Date().toLocaleTimeString();
      const logId = Math.random().toString(36).substr(2, 9);
      const particleId = Math.random().toString(36).substr(2, 9);

      if (isWrite) {
        if (isPrimaryCrashed) {
          setSimLogs(prev => [
            { id: logId, type: 'err', msg: 'WRITE FAILED: Primary database instance is crashed/unreachable.', time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setSimMetrics(prev => ({ ...prev, errors: prev.errors + 1 }));

          // Spawn failed write particle
          setParticles(prev => [...prev, { id: particleId, target: 'primary', isWrite: true }]);
          setActiveHighlightNode('primary');
          setTimeout(() => {
            setParticles(prev => prev.filter(p => p.id !== particleId));
            setActiveHighlightNode(null);
          }, 800);
        } else {
          const insertId = Math.floor(Math.random() * 1000);
          const targetPartition = insertId % partitions;
          setLastPartitionTarget(targetPartition);
          setSimLogs(prev => [
            { id: logId, type: 'write', msg: `WRITE SUCCESS: INSERT INTO users VALUES(${insertId}) -> Routed to Primary (10.0.1.2) -> Partition [users_p${targetPartition}]`, time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setSimMetrics(prev => ({ ...prev, writes: prev.writes + 1 }));

          // Spawn successful write particle
          setParticles(prev => [...prev, { id: particleId, target: 'primary', isWrite: true }]);
          setActiveHighlightNode('primary');

          // Trigger replicas update replication flow
          if (replicas > 0) {
            setTimeout(() => {
              const repParticleIds: string[] = [];
              for (let r = 0; r < replicas; r++) {
                const repParticleId = Math.random().toString(36).substr(2, 9);
                repParticleIds.push(repParticleId);
                setParticles(prev => [...prev, { id: repParticleId, target: 'replica', index: r, isWrite: true, isReplicationCopy: true }]);
              }
              // Clean up replication particles after 800ms
              setTimeout(() => {
                setParticles(prev => prev.filter(p => !repParticleIds.includes(p.id)));
              }, 800);
            }, 400);
          }

          setTimeout(() => {
            setParticles(prev => prev.filter(p => p.id !== particleId));
            setActiveHighlightNode(null);
          }, 800);
        }
      } else {
        // Read
        if (replicas > 0) {
          const targetReplica = Math.floor(Math.random() * replicas) + 1;
          const readId = Math.floor(Math.random() * 1000);
          const sourcePartition = readId % partitions;
          setLastPartitionTarget(sourcePartition);
          setSimLogs(prev => [
            { id: logId, type: 'read', msg: `READ SUCCESS: SELECT * FROM users_p${sourcePartition} -> Load balanced to Replica #${targetReplica} (10.0.1.${2 + targetReplica})`, time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setSimMetrics(prev => ({ ...prev, reads: prev.reads + 1 }));

          // Spawn replica read particle
          setParticles(prev => [...prev, { id: particleId, target: 'replica', index: targetReplica - 1, isWrite: false }]);
          setActiveHighlightNode(`replica-${targetReplica - 1}`);
          setTimeout(() => {
            setParticles(prev => prev.filter(p => p.id !== particleId));
            setActiveHighlightNode(null);
          }, 800);
        } else {
          if (isPrimaryCrashed) {
            setSimLogs(prev => [
              { id: logId, type: 'err', msg: 'READ FAILED: No active replicas, and primary database instance is crashed.', time: timeStr },
              ...prev.slice(0, 19)
            ]);
            setSimMetrics(prev => ({ ...prev, errors: prev.errors + 1 }));

            // Spawn failed read particle
            setParticles(prev => [...prev, { id: particleId, target: 'primary', isWrite: false }]);
            setActiveHighlightNode('primary');
            setTimeout(() => {
              setParticles(prev => prev.filter(p => p.id !== particleId));
              setActiveHighlightNode(null);
            }, 800);
          } else {
            const readId = Math.floor(Math.random() * 1000);
            const sourcePartition = readId % partitions;
            setLastPartitionTarget(sourcePartition);
            setSimLogs(prev => [
              { id: logId, type: 'read', msg: `READ SUCCESS: SELECT * FROM users_p${sourcePartition} -> Routed to Primary (10.0.1.2) [No Replicas Defined]`, time: timeStr },
              ...prev.slice(0, 19)
            ]);
            setSimMetrics(prev => ({ ...prev, reads: prev.reads + 1 }));

            // Spawn primary read particle
            setParticles(prev => [...prev, { id: particleId, target: 'primary', isWrite: false }]);
            setActiveHighlightNode('primary');
            setTimeout(() => {
              setParticles(prev => prev.filter(p => p.id !== particleId));
              setActiveHighlightNode(null);
            }, 800);
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [trafficActive, isPrimaryCrashed, replicas, partitions, visible, setSimLogs]);

  const getReplicasStyles = () => {
    let styleStr = '';
    // Write request flow from client to primary
    styleStr += `
      @keyframes flowToPrimary {
        0% { left: 15%; top: 50%; opacity: 1; }
        100% { left: 45%; top: 50%; opacity: 0.8; }
      }
    `;

    // Read request round-trip flow (client -> primary -> client)
    styleStr += `
      @keyframes readFlowToPrimary {
        0% { left: 15%; top: 50%; opacity: 1; }
        45% { left: 45%; top: 50%; opacity: 0.9; }
        55% { left: 45%; top: 50%; opacity: 0.9; }
        100% { left: 15%; top: 50%; opacity: 1; }
      }
    `;

    if (replicas === 1) {
      styleStr += `
        @keyframes readFlowToReplica0 {
          0% { left: 15%; top: 50%; opacity: 1; }
          45% { left: 78%; top: 50%; opacity: 0.9; }
          55% { left: 78%; top: 50%; opacity: 0.9; }
          100% { left: 15%; top: 50%; opacity: 1; }
        }
        @keyframes replicationToReplica0 {
          0% { left: 45%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 50%; opacity: 0.8; }
        }
      `;
    } else if (replicas === 2) {
      styleStr += `
        @keyframes readFlowToReplica0 {
          0% { left: 15%; top: 50%; opacity: 1; }
          45% { left: 78%; top: 35%; opacity: 0.9; }
          55% { left: 78%; top: 35%; opacity: 0.9; }
          100% { left: 15%; top: 50%; opacity: 1; }
        }
        @keyframes readFlowToReplica1 {
          0% { left: 15%; top: 50%; opacity: 1; }
          45% { left: 78%; top: 65%; opacity: 0.9; }
          55% { left: 78%; top: 65%; opacity: 0.9; }
          100% { left: 15%; top: 50%; opacity: 1; }
        }
        @keyframes replicationToReplica0 {
          0% { left: 45%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 35%; opacity: 0.8; }
        }
        @keyframes replicationToReplica1 {
          0% { left: 45%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 65%; opacity: 0.8; }
        }
      `;
    } else if (replicas === 3) {
      styleStr += `
        @keyframes readFlowToReplica0 {
          0% { left: 15%; top: 50%; opacity: 1; }
          45% { left: 78%; top: 20%; opacity: 0.9; }
          55% { left: 78%; top: 20%; opacity: 0.9; }
          100% { left: 15%; top: 50%; opacity: 1; }
        }
        @keyframes readFlowToReplica1 {
          0% { left: 15%; top: 50%; opacity: 1; }
          45% { left: 78%; top: 50%; opacity: 0.9; }
          55% { left: 78%; top: 50%; opacity: 0.9; }
          100% { left: 15%; top: 50%; opacity: 1; }
        }
        @keyframes readFlowToReplica2 {
          0% { left: 15%; top: 50%; opacity: 1; }
          45% { left: 78%; top: 80%; opacity: 0.9; }
          55% { left: 78%; top: 80%; opacity: 0.9; }
          100% { left: 15%; top: 50%; opacity: 1; }
        }
        @keyframes replicationToReplica0 {
          0% { left: 45%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 20%; opacity: 0.8; }
        }
        @keyframes replicationToReplica1 {
          0% { left: 45%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 50%; opacity: 0.8; }
        }
        @keyframes replicationToReplica2 {
          0% { left: 45%; top: 50%; opacity: 1; }
          100% { left: 78%; top: 80%; opacity: 0.8; }
        }
      `;
    }
    return styleStr;
  };

  return (
    <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#1E293B' }}>{t('postgres.simulation.title')}</h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
            {t('postgres.simulation.desc')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setTrafficActive(p => !p)}
            style={{
              backgroundColor: trafficActive ? '#EF4444' : '#10B981',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            {trafficActive ? t('postgres.simulation.pauseBtn') : t('postgres.simulation.startBtn')}
          </button>
          <button
            onClick={() => {
              if (isPrimaryCrashed) {
                setIsPrimaryCrashed(false);
                setSimLogs(prev => [
                  { id: Math.random().toString(), type: 'sys', msg: 'Failover/Recovery: Primary Postgres Server recovered and is ONLINE.', time: new Date().toLocaleTimeString() },
                  ...prev
                ]);
              } else {
                setIsPrimaryCrashed(true);
                setSimLogs(prev => [
                  { id: Math.random().toString(), type: 'err', msg: 'FAILOVER EVENT: Primary Postgres container CRASHED (Offline).', time: new Date().toLocaleTimeString() },
                  ...prev
                ]);
              }
            }}
            style={{
              backgroundColor: isPrimaryCrashed ? '#10B981' : '#EF4444',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            {isPrimaryCrashed ? t('postgres.simulation.recoverBtn') : t('postgres.simulation.crashBtn')}
          </button>
          {isPrimaryCrashed && replicas > 0 && (
            <button
              onClick={() => {
                setIsPrimaryCrashed(false);
                setReplicas(prev => prev - 1);
                setSimLogs(prev => [
                  { id: Math.random().toString(), type: 'sys', msg: 'FAILOVER COMPLETED: Replica promoted to Primary. Writes restored.', time: new Date().toLocaleTimeString() },
                  ...prev
                ]);
              }}
              style={{
                backgroundColor: '#3B82F6',
                color: 'white',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              {t('postgres.simulation.promoteBtn')}
            </button>
          )}
        </div>
      </div>

      {/* Simulation metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>{t('postgres.simulation.reads')}</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563EB', marginTop: '4px' }}>{simMetrics.reads}</div>
        </div>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>{t('postgres.simulation.writes')}</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10B981', marginTop: '4px' }}>{simMetrics.writes}</div>
        </div>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: '#FEE2E2' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#991B1B', fontWeight: 600 }}>{t('postgres.simulation.errors')}</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#EF4444', marginTop: '4px' }}>{simMetrics.errors}</div>
        </div>
      </div>

      {/* Dynamic CSS Styles for Simulation Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        .flow-particle {
          position: absolute;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 20;
          box-shadow: 0 0 12px 4px currentColor;
        }
        .ring-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          animation: ringFlash 0.8s ease-out forwards;
          border: 2px solid currentColor;
          z-index: 10;
        }
        @keyframes ringFlash {
          0% { width: 40px; height: 40px; opacity: 0.8; }
          100% { width: 80px; height: 80px; opacity: 0; }
        }
        ${getReplicasStyles()}
      `}} />

      {/* Topology Map Wrapper (Zoom/Pan Container) */}
      <div
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          flex: 1,
          minHeight: '260px',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          backgroundColor: '#0F172A',
          position: 'relative',
          overflow: 'hidden',
          cursor: isPanning ? 'grabbing' : 'grab',
          userSelect: 'none'
        }}
      >
        {/* Reset Zoom Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setZoomScale(1);
            setPanOffset({ x: 0, y: 0 });
          }}
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid #334155',
            borderRadius: '4px',
            color: '#94A3B8',
            padding: '2px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            zIndex: 30
          }}
        >
          Reset View (Zoom: {Math.round(zoomScale * 100)}%)
        </button>

        {/* Inner Viewport applying Zoom & Pan */}
        <div style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
          transformOrigin: 'center center',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          {/* SVG Connection Paths */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
            {/* Path to primary */}
            <line x1="12%" y1="50%" x2="42%" y2="50%" stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeDasharray="5,5" />
            {/* Paths to replicas */}
            {replicas > 0 && Array.from({ length: replicas }).map((_, i) => {
              let repTop = '50%';
              if (replicas === 2) repTop = i === 0 ? '35%' : '65%';
              else if (replicas === 3) repTop = i === 0 ? '20%' : i === 1 ? '50%' : '80%';
              return (
                <line key={i} x1="12%" y1="50%" x2="78%" y2={repTop} stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeDasharray="5,5" />
              );
            })}
          </svg>

          {/* Client source */}
          <div style={{ position: 'absolute', left: '10%', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Server size={32} color="#94A3B8" />
            <span style={{ color: '#E2E8F0', fontSize: '11px', marginTop: '6px', fontWeight: 600 }}>App Server</span>
            <span style={{ color: '#64748B', fontSize: '10px' }}>10.0.1.1</span>
          </div>

          {/* Flowing Query Particles */}
          {particles.map(p => {
            let animationName: string;
            if (p.isReplicationCopy) {
              animationName = `replicationToReplica${p.index ?? 0}`;
            } else if (p.isWrite) {
              animationName = 'flowToPrimary';
            } else {
              animationName = p.target === 'primary' ? 'readFlowToPrimary' : `readFlowToReplica${p.index ?? 0}`;
            }
            const color = p.isWrite ? '#10B981' : '#3B82F6';
            return (
              <div
                key={p.id}
                className="flow-particle"
                style={{
                  color,
                  backgroundColor: color,
                  animation: `${animationName} 0.8s ease-in-out forwards`
                }}
              />
            );
          })}

          {/* Arrow indicator */}
          <div style={{ position: 'absolute', left: '30%', top: '50%', transform: 'translateY(-50%)', color: trafficActive ? '#10B981' : '#475569' }}>
            <span className={trafficActive ? 'pulse' : ''} style={{ fontSize: '18px', fontWeight: 'bold' }}>➔</span>
          </div>
           {/* Primary DB Node */}
          <div style={{ position: 'absolute', left: '42%', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Database size={44} color={isPrimaryCrashed ? '#EF4444' : '#10B981'} />
              {activeHighlightNode === 'primary' && (
                <div className="ring-glow" style={{ color: isPrimaryCrashed ? '#EF4444' : '#10B981' }} />
              )}
            </div>
            <span style={{ color: '#E2E8F0', fontSize: '12px', fontWeight: 'bold', marginTop: '6px' }}>Primary SQL DB</span>
            <span style={{ color: isPrimaryCrashed ? '#EF4444' : '#10B981', fontSize: '10px' }}>
              {isPrimaryCrashed ? 'OFFLINE (Crashed)' : 'ONLINE (10.0.1.2)'}
            </span>

            {/* Table Partitions Display */}
            {!isPrimaryCrashed && (
              <div style={{ display: 'flex', gap: '4px', marginTop: '10px', backgroundColor: 'rgba(30, 41, 59, 0.5)', padding: '4px 8px', borderRadius: '6px', border: '1px solid #334155' }}>
                {Array.from({ length: partitions }).map((_, pIdx) => {
                  const isPartActive = activeHighlightNode === 'primary' && lastPartitionTarget === pIdx;
                  return (
                    <div
                      key={pIdx}
                      style={{
                        fontSize: '9px',
                        padding: '2px 5px',
                        borderRadius: '4px',
                        backgroundColor: isPartActive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(15, 23, 42, 0.6)',
                        border: isPartActive ? '1px solid #10B981' : '1px solid #475569',
                        color: isPartActive ? '#10B981' : '#94A3B8',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                        transition: 'all 0.15s ease-in-out'
                      }}
                      title={`Partition: users_p${pIdx}`}
                    >
                      p{pIdx}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Replicas container */}
          {replicas > 0 && (
            <div style={{ position: 'absolute', right: '12%', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center' }}>
              {Array.from({ length: replicas }).map((_, i) => {
                const isNodeActive = activeHighlightNode === `replica-${i}`;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#3B82F6', fontSize: '12px' }}>➔</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <Database size={28} color="#3B82F6" />
                        {isNodeActive && (
                          <div className="ring-glow" style={{ color: '#3B82F6' }} />
                        )}
                      </div>
                      <span style={{ color: '#E2E8F0', fontSize: '10px', fontWeight: 600 }}>Replica #{i + 1}</span>
                      <span style={{ color: '#64748B', fontSize: '9px' }}>10.0.1.{3 + i}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Logs output */}
      <div style={{ height: '150px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
          {t('postgres.simulation.logTitle')}
        </div>
        <div style={{ flex: 1, backgroundColor: '#0F172A', color: '#94A3B8', borderRadius: '8px', padding: '10px', fontFamily: 'monospace', fontSize: '11px', overflowY: 'auto' }}>
          {simLogs.map(log => (
            <div key={log.id} style={{ marginBottom: '4px', color: log.type === 'err' ? '#FCA5A5' : log.type === 'sys' ? '#6EE7B7' : log.type === 'write' ? '#A7F3D0' : '#93C5FD' }}>
              [{log.time}] {log.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
