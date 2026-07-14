import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Server } from 'lucide-react';
import { inspectorStyles as styles } from '../components/inspectorStyles';

export interface NoSqlSimLog {
  id: string;
  type: 'route' | 'warn' | 'sys';
  msg: string;
  time: string;
}

interface NoSqlSimulationTabProps {
  /** Traffic only flows while the tab is actually shown. */
  visible: boolean;
  shards: number;
  replicas: number;
  simLogs: NoSqlSimLog[];
  setSimLogs: Dispatch<SetStateAction<NoSqlSimLog[]>>;
}

/**
 * Educational mongos/shard/replica-set topology simulation: hash-based write
 * routing, stale secondary reads (eventual consistency), shard crash and
 * automatic replica election. Shards/replicas are owned by the modal (the
 * details tab scales them).
 */
export default function NoSqlSimulationTab({
  visible,
  shards,
  replicas,
  simLogs,
  setSimLogs,
}: NoSqlSimulationTabProps) {
  const { t } = useTranslation();

  // Zoom and Pan states for interactive topology viewport
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Floating query particles
  const [particles, setParticles] = useState<Array<{ id: string; target: number; isWrite: boolean; isReplicaCopy?: boolean; replicaIndex?: number; isStale?: boolean }>>([]);

  // Active highlighted target node for simulation flash
  const [activeHighlightNode, setActiveHighlightNode] = useState<string | null>(null);

  const [trafficActive, setTrafficActive] = useState(false);
  const [simMetrics, setSimMetrics] = useState({ routed: 0, staleReads: 0 });
  const [lastHashedKey, setLastHashedKey] = useState<string>('');
  const [lastShardIndex, setLastShardIndex] = useState<number>(-1);
  const [crashedShards, setCrashedShards] = useState<Record<number, boolean>>({});

  // Automatic replica promotion (election) upon Shard Primary crash
  useEffect(() => {
    const crashedShardIndexStr = Object.keys(crashedShards).find(k => crashedShards[Number(k)] && replicas > 0);
    if (crashedShardIndexStr !== undefined) {
      const shardIdx = Number(crashedShardIndexStr);
      const timer = setTimeout(() => {
        setCrashedShards(prev => ({ ...prev, [shardIdx]: false }));
        setSimLogs(prev => [
          {
            id: Math.random().toString(),
            type: 'sys',
            msg: `REPLICA ELECTION: Shard #${shardIdx + 1} Replica Set detected Primary outage. Automatically elected Secondary to Primary. Shard operations restored.`,
            time: new Date().toLocaleTimeString()
          },
          ...prev
        ]);
      }, 3500); // Election delay 3.5 seconds
      return () => clearTimeout(timer);
    }
  }, [crashedShards, replicas, setSimLogs]);

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

  // Traffic simulation (sharding hash routing + eventual consistency)
  useEffect(() => {
    if (!trafficActive || !visible) return;

    const interval = setInterval(() => {
      const isWrite = Math.random() > 0.4;
      const timeStr = new Date().toLocaleTimeString();
      const logId = Math.random().toString(36).substr(2, 9);
      const randomDocId = Math.random().toString(36).substring(3, 11);
      const particleId = Math.random().toString(36).substr(2, 9);

      // Simple hash helper
      let hash = 0;
      for (let i = 0; i < randomDocId.length; i++) {
        hash = randomDocId.charCodeAt(i) + ((hash << 5) - hash);
      }
      const targetShard = Math.abs(hash) % shards;

      if (isWrite) {
        setLastHashedKey(randomDocId);
        setLastShardIndex(targetShard);

        if (crashedShards[targetShard]) {
          setSimLogs(prev => [
            { id: logId, type: 'warn', msg: `WRITE FAILED: Shard Primary #${targetShard + 1} is crashed/unreachable. Query router timed out.`, time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setParticles(prev => [...prev, { id: particleId, target: targetShard, isWrite: true }]);
          setActiveHighlightNode(`shard-primary-${targetShard}`);
        } else {
          setSimLogs(prev => [
            { id: logId, type: 'route', msg: `WRITE: Document ID [${randomDocId}] ➔ hash ➔ Routed to Shard Primary #${targetShard + 1} (Partition ${targetShard})`, time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setSimMetrics(prev => ({ ...prev, routed: prev.routed + 1 }));

          // Spawn write particle to Shard Primary
          setParticles(prev => [...prev, { id: particleId, target: targetShard, isWrite: true }]);
          setActiveHighlightNode(`shard-primary-${targetShard}`);

          // Replicating to replica members (visual secondary particles)
          if (replicas > 0) {
            setTimeout(() => {
              const repParticleIds: string[] = [];
              for (let r = 0; r < replicas; r++) {
                const repParticleId = Math.random().toString(36).substr(2, 9);
                repParticleIds.push(repParticleId);
                setParticles(prev => [...prev, { id: repParticleId, target: targetShard, isWrite: true, isReplicaCopy: true, replicaIndex: r }]);
              }
              // Clean up replica replication particles after 800ms
              setTimeout(() => {
                setParticles(prev => prev.filter(p => !repParticleIds.includes(p.id)));
              }, 800);
            }, 400);
          }
        }

        setTimeout(() => {
          setParticles(prev => prev.filter(p => p.id !== particleId));
          setActiveHighlightNode(null);
        }, 800);
      } else {
        // Read: demonstrate eventual consistency stale reads occasionally
        const isStale = replicas > 0 && Math.random() > 0.8;
        if (crashedShards[targetShard]) {
          if (replicas > 0) {
            // Can read from replica
            const targetReplica = Math.floor(Math.random() * replicas);
            setSimLogs(prev => [
              { id: logId, type: 'route', msg: `READ SUCCESS: Primary Shard #${targetShard + 1} offline. Router retrieved data from secondary Replica #${targetReplica + 1}.`, time: timeStr },
              ...prev.slice(0, 19)
            ]);
            setSimMetrics(prev => ({ ...prev, routed: prev.routed + 1 }));
            setParticles(prev => [...prev, { id: particleId, target: targetShard, isWrite: false, replicaIndex: targetReplica }]);
            setActiveHighlightNode(`shard-replica-${targetShard}-${targetReplica}`);
          } else {
            setSimLogs(prev => [
              { id: logId, type: 'warn', msg: `READ FAILED: Shard #${targetShard + 1} is offline and has no replicas available.`, time: timeStr },
              ...prev.slice(0, 19)
            ]);
            setParticles(prev => [...prev, { id: particleId, target: targetShard, isWrite: false }]);
            setActiveHighlightNode(`shard-primary-${targetShard}`);
          }
          setTimeout(() => {
            setParticles(prev => prev.filter(p => p.id !== particleId));
            setActiveHighlightNode(null);
          }, 800);
        } else if (isStale) {
          const targetReplica = Math.floor(Math.random() * replicas);
          setSimLogs(prev => [
            { id: logId, type: 'warn', msg: `READ WARNING: Read query for [${randomDocId}] routed to Shard #${targetShard + 1} Replica #${targetReplica + 1} returned stale secondary state (Eventual Consistency lag).`, time: timeStr },
            ...prev.slice(0, 19)
          ]);
          setSimMetrics(prev => ({ ...prev, staleReads: prev.staleReads + 1 }));

          setParticles(prev => [...prev, { id: particleId, target: targetShard, isWrite: false, isStale: true, replicaIndex: targetReplica }]);
          setActiveHighlightNode(`shard-replica-${targetShard}-${targetReplica}`);

          setTimeout(() => {
            setParticles(prev => prev.filter(p => p.id !== particleId));
            setActiveHighlightNode(null);
          }, 800);
        } else {
          // Normal Read (can go to primary or replica if replicas > 0)
          const useReplica = replicas > 0 && Math.random() > 0.5;
          if (useReplica) {
            const targetReplica = Math.floor(Math.random() * replicas);
            setSimLogs(prev => [
              { id: logId, type: 'sys', msg: `READ: Query for ID [${randomDocId}] ➔ Router directed to Shard #${targetShard + 1} Replica #${targetReplica + 1}`, time: timeStr },
              ...prev.slice(0, 19)
            ]);
            setSimMetrics(prev => ({ ...prev, routed: prev.routed + 1 }));

            setParticles(prev => [...prev, { id: particleId, target: targetShard, isWrite: false, replicaIndex: targetReplica }]);
            setActiveHighlightNode(`shard-replica-${targetShard}-${targetReplica}`);
          } else {
            setSimLogs(prev => [
              { id: logId, type: 'sys', msg: `READ: Query for ID [${randomDocId}] ➔ Router directed to Shard Primary #${targetShard + 1}`, time: timeStr },
              ...prev.slice(0, 19)
            ]);
            setSimMetrics(prev => ({ ...prev, routed: prev.routed + 1 }));

            setParticles(prev => [...prev, { id: particleId, target: targetShard, isWrite: false }]);
            setActiveHighlightNode(`shard-primary-${targetShard}`);
          }

          setTimeout(() => {
            setParticles(prev => prev.filter(p => p.id !== particleId));
            setActiveHighlightNode(null);
          }, 800);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [trafficActive, shards, replicas, crashedShards, visible, setSimLogs]);

  const getShardsStyles = () => {
    let styleStr = '';
    for (let i = 0; i < shards; i++) {
      const topPercent = shards === 1 ? 50 : 15 + (i * 70) / (shards - 1);

      // Animation from mongos (left: 10%) to shard primary (left: 45%)
      styleStr += `
        @keyframes flowToShardPrimary${i} {
          0% { left: 15%; top: 50%; opacity: 1; }
          100% { left: 45%; top: ${topPercent}%; opacity: 0.8; }
        }
        @keyframes readFlowToShardPrimary${i} {
          0% { left: 15%; top: 50%; opacity: 1; }
          45% { left: 45%; top: ${topPercent}%; opacity: 0.9; }
          55% { left: 45%; top: ${topPercent}%; opacity: 0.9; }
          100% { left: 15%; top: 50%; opacity: 1; }
        }
      `;

      // Animations for replica read round-trip and replication copy flow
      for (let r = 0; r < 3; r++) {
        const repOffset = (r - (replicas - 1) / 2) * 12;
        const repTopPercent = topPercent + (replicas > 1 ? repOffset : 0);

        styleStr += `
          @keyframes readFlowToShardReplica${i}_${r} {
            0% { left: 15%; top: 50%; opacity: 1; }
            45% { left: 78%; top: ${repTopPercent}%; opacity: 0.9; }
            55% { left: 78%; top: ${repTopPercent}%; opacity: 0.9; }
            100% { left: 15%; top: 50%; opacity: 1; }
          }
          @keyframes replicationToShardReplica${i}_${r} {
            0% { left: 45%; top: ${topPercent}%; opacity: 1; }
            100% { left: 78%; top: ${repTopPercent}%; opacity: 0.8; }
          }
        `;
      }
    }
    return styleStr;
  };

  return (
    <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: '#1E293B' }}>{t('nosql.simulation.title')}</h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
            {t('nosql.simulation.desc')}
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
            {trafficActive ? t('nosql.simulation.pauseBtn') : t('nosql.simulation.startBtn')}
          </button>
          <button
            onClick={() => {
              const activeTarget = lastShardIndex >= 0 ? lastShardIndex : 0;
              const isCurrentlyCrashed = !!crashedShards[activeTarget];
              setCrashedShards(prev => ({ ...prev, [activeTarget]: !isCurrentlyCrashed }));
              setSimLogs(prev => [
                {
                  id: Math.random().toString(),
                  type: isCurrentlyCrashed ? 'sys' : 'warn',
                  msg: isCurrentlyCrashed
                    ? `RECOVERY: Shard Primary #${activeTarget + 1} recovered and is ONLINE.`
                    : `CRASH EVENT: Shard Primary #${activeTarget + 1} crashed (Offline).`,
                  time: new Date().toLocaleTimeString()
                },
                ...prev
              ]);
            }}
            style={{
              backgroundColor: crashedShards[lastShardIndex >= 0 ? lastShardIndex : 0] ? '#10B981' : '#EF4444',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            {crashedShards[lastShardIndex >= 0 ? lastShardIndex : 0] ? t('nosql.simulation.recoverBtn') : t('nosql.simulation.crashBtn')}
          </button>
        </div>
      </div>

      {/* Simulation metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748B', fontWeight: 600 }}>{t('nosql.simulation.routed')}</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563EB', marginTop: '4px' }}>{simMetrics.routed}</div>
        </div>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: '#FEF3C7' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#B45309', fontWeight: 600 }}>{t('nosql.simulation.stale')}</span>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#D97706', marginTop: '4px' }}>{simMetrics.staleReads}</div>
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
        ${getShardsStyles()}
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

        {/* Hashing key status overlay */}
        {lastHashedKey && (
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '11px',
            color: '#93C5FD',
            fontFamily: 'monospace',
            zIndex: 30
          }}>
            Key: "{lastHashedKey}" ➔ MD5 ➔ Shard {lastShardIndex + 1}
          </div>
        )}

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
            {/* Path from mongos to each Shard Primary */}
            {Array.from({ length: shards }).map((_, i) => {
              const topPercent = shards === 1 ? 50 : 15 + (i * 70) / (shards - 1);
              return (
                <g key={i}>
                  <line x1="12%" y1="50%" x2="42%" y2={`${topPercent}%`} stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeDasharray="5,5" />
                  {/* Paths from Shard Primary to its Replicas */}
                  {replicas > 0 && Array.from({ length: replicas }).map((_, r) => {
                    const repOffset = (r - (replicas - 1) / 2) * 12;
                    const repTopPercent = topPercent + (replicas > 1 ? repOffset : 0);
                    return (
                      <line key={r} x1="42%" y1={`${topPercent}%`} x2="78%" y2={`${repTopPercent}%`} stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" strokeDasharray="3,3" />
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {/* mongos Router */}
          <div style={{ position: 'absolute', left: '10%', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Server size={32} color="#94A3B8" />
            <span style={{ color: '#E2E8F0', fontSize: '11px', marginTop: '6px', fontWeight: 600 }}>mongos Router</span>
            <span style={{ color: '#64748B', fontSize: '10px' }}>10.0.2.1</span>
          </div>

          {/* Flowing Query Particles */}
          {particles.map(p => {
            const animName = p.isReplicaCopy
              ? `replicationToShardReplica${p.target}_${p.replicaIndex ?? 0}`
              : (p.isWrite
                  ? `flowToShardPrimary${p.target}`
                  : (p.replicaIndex !== undefined
                      ? `readFlowToShardReplica${p.target}_${p.replicaIndex}`
                      : `readFlowToShardPrimary${p.target}`));
            const color = p.isWrite ? '#10B981' : (p.isStale ? '#F59E0B' : '#3B82F6');
            return (
              <div
                key={p.id}
                className="flow-particle"
                style={{
                  color,
                  backgroundColor: color,
                  animation: `${animName} 0.8s ease-in-out forwards`
                }}
              />
            );
          })}

          {/* Shard Primaries List */}
          {Array.from({ length: shards }).map((_, i) => {
            const topPercent = shards === 1 ? 50 : 15 + (i * 70) / (shards - 1);
            const isNodeActive = activeHighlightNode === `shard-primary-${i}`;
            const isShardCrashed = !!crashedShards[i];
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: '42%',
                  top: `${topPercent}%`,
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center'
                }}
              >
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <Database size={40} color={isShardCrashed ? '#EF4444' : (isNodeActive ? '#10B981' : '#64748B')} />
                  {isNodeActive && (
                    <div className="ring-glow" style={{ color: isShardCrashed ? '#EF4444' : '#10B981' }} />
                  )}
                </div>
                <span style={{ color: '#E2E8F0', fontSize: '11px', fontWeight: 'bold', marginTop: '4px' }}>Shard Primary #{i + 1}</span>
                <span style={{ color: isShardCrashed ? '#EF4444' : '#10B981', fontSize: '9px' }}>
                  {isShardCrashed ? 'OFFLINE' : `ONLINE (10.0.2.${10 + i * 10})`}
                </span>
              </div>
            );
          })}

          {/* Replica Members List per Shard */}
          {replicas > 0 && Array.from({ length: shards }).map((_, i) => {
            const topPercent = shards === 1 ? 50 : 15 + (i * 70) / (shards - 1);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  right: '12%',
                  top: `${topPercent}%`,
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  justifyContent: 'center'
                }}
              >
                {Array.from({ length: replicas }).map((_, r) => {
                  const repOffset = (r - (replicas - 1) / 2) * 12;
                  const repTopPercent = replicas > 1 ? repOffset : 0;
                  const isNodeActive = activeHighlightNode === `shard-replica-${i}-${r}`;

                  return (
                    <div
                      key={r}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transform: `translateY(${repTopPercent}px)`
                      }}
                    >
                      <span style={{ color: '#3B82F6', fontSize: '12px' }}>➔</span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <Database size={24} color={isNodeActive ? '#3B82F6' : '#475569'} />
                          {isNodeActive && (
                            <div className="ring-glow" style={{ color: '#3B82F6' }} />
                          )}
                        </div>
                        <span style={{ color: '#E2E8F0', fontSize: '9px' }}>Replica #{r + 1}</span>
                        <span style={{ color: '#64748B', fontSize: '8px' }}>10.0.2.${10 + i * 10 + r + 1}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {/* Logs output */}
      <div style={{ height: '140px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
          {t('nosql.simulation.logTitle')}
        </div>
        <div style={{ flex: 1, backgroundColor: '#0F172A', color: '#94A3B8', borderRadius: '8px', padding: '10px', fontFamily: 'monospace', fontSize: '11px', overflowY: 'auto' }}>
          {simLogs.map(log => (
            <div key={log.id} style={{ marginBottom: '4px', color: log.type === 'warn' ? '#F59E0B' : log.type === 'route' ? '#6EE7B7' : '#93C5FD' }}>
              [{log.time}] {log.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
