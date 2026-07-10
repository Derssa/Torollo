import { Handle, Position } from '@xyflow/react';
import { Play, Square, Trash2, Shield, Pencil } from 'lucide-react';
import React from 'react';
import styles from '../ServiceNode.module.css';

interface BaseNodeProps {
  id: string;
  name: string;
  isRunning: boolean;
  icon: React.ReactNode;
  
  // Custom Styles
  customBorder?: string;
  customTitleColor?: string;
  hideHandles?: boolean;
  
  // Handlers
  onRename?: (id: string, currentName: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onSecurityGroupOpen?: (id: string, name: string) => void;
  
  // Primary action button (shown when running)
  primaryAction?: {
    label: string;
    icon: React.ReactNode;
    color?: string; // Background color
    onClick: (id: string, name: string) => void;
    title?: string;
  };
  
  // Quick sub-info line
  subtitle?: React.ReactNode;

  // Reason of the last failed operation (start/stop/delete) on this node
  errorMessage?: string;
}

export default function BaseNode({
  id,
  name,
  isRunning,
  icon,
  customBorder,
  customTitleColor,
  hideHandles,
  onRename,
  onStart,
  onStop,
  onDelete,
  onSecurityGroupOpen,
  primaryAction,
  subtitle,
  errorMessage
}: BaseNodeProps) {

  const titleColor = customTitleColor || 'var(--color-text-primary)';
  const hasError = Boolean(errorMessage) && !isRunning;
  const indicatorColor = isRunning ? '#10B981' : hasError ? '#F59E0B' : '#EF4444';
  const shadowColor = isRunning
    ? 'rgba(16, 185, 129, 0.6)'
    : hasError
      ? 'rgba(245, 158, 11, 0.6)'
      : 'rgba(239, 68, 68, 0.6)';

  return (
    <div 
      className={styles.card}
      style={{
        border: customBorder,
        boxShadow: customBorder && isRunning ? `0 10px 15px -3px ${customBorder.split(' ').pop()}25` : undefined
      }}
    >
      {!hideHandles && <Handle type="target" position={Position.Left} id="target" className={styles.handle} />}

      <div className={styles.header}>
        <div className={styles.titleContainer}>
          {icon}
          <span className={styles.title} style={{ color: titleColor }}>{name}</span>

          {onRename && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isRunning) {
                  onRename(id, name);
                }
              }}
              className={`${styles.renameBtn} ${isRunning ? styles.disabled : ''}`}
              data-tooltip={isRunning ? "Stop the service to rename this node" : "Rename node"}
            >
              <Pencil size={12} />
            </button>
          )}

          {onSecurityGroupOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSecurityGroupOpen(id, name);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                marginLeft: '4px',
              }}
              title="Configure Security Group (Firewall)"
            >
              <Shield size={13} color="#EF4444" fill="rgba(239, 68, 68, 0.1)" />
            </button>
          )}
        </div>

        <div className={styles.statusRow}>
          <div
            className={styles.indicator}
            style={{
              backgroundColor: indicatorColor,
              boxShadow: `0 0 8px ${shadowColor}`
            }}
          />
          <span className={styles.statusText}>{isRunning ? 'Online' : hasError ? 'Error' : 'Offline'}</span>
        </div>
      </div>

      {subtitle && (
        <div className={styles.details}>
          {subtitle}
        </div>
      )}

      {hasError && (
        <div
          className={styles.details}
          title={errorMessage}
          style={{
            color: '#92400E',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {errorMessage}
        </div>
      )}

      <div className={styles.actions}>
        {isRunning ? (
          <>
            {primaryAction && (
              <button
                onClick={() => primaryAction.onClick(id, name)}
                className={`${styles.btn} ${styles.btnPrimary}`}
                style={primaryAction.color ? { backgroundColor: primaryAction.color } : {}}
                title={primaryAction.title || primaryAction.label}
              >
                {primaryAction.icon}
                {primaryAction.label}
              </button>
            )}
            <button
              onClick={() => onStop(id)}
              className={`${styles.btn} ${styles.btnSecondary}`}
              title="Stop Node"
            >
              <Square size={14} fill="#9CA3AF" />
            </button>
          </>
        ) : (
          <button
            onClick={() => onStart(id)}
            className={`${styles.btn} ${styles.btnSuccess}`}
            title="Start Node"
          >
            <Play size={14} style={{ marginRight: 4 }} fill="#10B981" />
            Start
          </button>
        )}

        <button
          onClick={() => onDelete(id)}
          className={`${styles.btn} ${styles.btnDanger}`}
          title="Delete Node"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {!hideHandles && <Handle type="source" position={Position.Right} id="source" className={styles.handle} />}
    </div>
  );
}
