import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

export default function ButtonEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  data
}: EdgeProps) {
  const { t } = useTranslation();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  });

  const onEdgeClick = (evt: React.MouseEvent) => {
    evt.stopPropagation();
    if (data && typeof data === 'object' && 'onDelete' in data && typeof data.onDelete === 'function') {
      data.onDelete(id);
    }
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 10,
            pointerEvents: 'all',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            backgroundColor: 'var(--neutral-100)',
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid var(--neutral-300)',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            zIndex: 1000,
          }}
        >
          {label && <span style={{ fontWeight: 600, color: 'var(--neutral-700)' }}>{label}</span>}
          <button
            onClick={onEdgeClick}
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: 'var(--color-danger)',
              color: 'var(--color-white)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 8,
              lineHeight: 1,
              padding: 0,
              fontWeight: 'bold',
            }}
            title={t('common.deleteConnection')}
          >
            ✕
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
