import { Handle, Position } from '@xyflow/react';
import { Play, Square, Trash2, Shield, Pencil } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  const titleColor = customTitleColor || 'var(--color-text-primary)';
  const hasError = Boolean(errorMessage) && !isRunning;
  const indicatorColor = isRunning ? 'var(--color-success)' : hasError ? 'var(--color-warning)' : 'var(--color-danger)';
  const shadowColor = isRunning
    ? 'color-mix(in srgb, var(--color-success) 60%, transparent)'
    : hasError
      ? 'color-mix(in srgb, var(--color-warning) 60%, transparent)'
      : 'color-mix(in srgb, var(--color-danger) 60%, transparent)';

  return (
    <div 
      className={styles.card}
      style={{
        border: customBorder,
        boxShadow: customBorder && isRunning ? `0 10px 15px -3px color-mix(in srgb, ${customBorder.split(' ').pop()} 15%, transparent)` : undefined
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
              data-tooltip={isRunning ? t('nodeshared.base.renameStopFirst') : t('nodeshared.base.renameNode')}
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
              title={t('nodeshared.base.securityGroupTitle')}
            >
              <Shield size={13} color="var(--color-danger)" fill="color-mix(in srgb, var(--color-danger) 10%, transparent)" />
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
          <span className={styles.statusText}>{isRunning ? t('nodeshared.base.online') : hasError ? t('nodeshared.base.error') : t('nodeshared.base.offline')}</span>
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
            color: 'var(--color-warning-strong)',
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
              title={t('nodeshared.base.stopNode')}
            >
              <Square size={14} fill="var(--neutral-400)" />
            </button>
          </>
        ) : (
          <button
            onClick={() => onStart(id)}
            className={`${styles.btn} ${styles.btnSuccess}`}
            title={t('nodeshared.base.startNode')}
          >
            <Play size={14} style={{ marginRight: 4 }} fill="var(--color-success)" />
            {t('nodeshared.base.start')}
          </button>
        )}

        <button
          onClick={() => onDelete(id)}
          className={`${styles.btn} ${styles.btnDanger}`}
          title={t('nodeshared.base.deleteNode')}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {!hideHandles && <Handle type="source" position={Position.Right} id="source" className={styles.handle} />}
    </div>
  );
}
