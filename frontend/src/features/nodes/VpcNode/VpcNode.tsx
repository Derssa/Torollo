import { Shield, Settings, Trash } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface VpcNodeProps {
  data: {
    id: string;
    name?: string;
    hoverStatus?: 'valid' | 'invalid' | null;
    onConfigure?: (id: string, name: string) => void;
    onDelete?: (id: string) => void;
  };
}

export default function VpcNode({ data }: VpcNodeProps) {
  const { t } = useTranslation();
  const isHovered = data.hoverStatus === 'valid' || data.hoverStatus === 'invalid';
  const borderColor = isHovered 
    ? (data.hoverStatus === 'valid' ? 'var(--color-success)' : 'var(--color-danger)')
    : 'var(--color-accent)';
  const boxShadow = isHovered
    ? (data.hoverStatus === 'valid' ? '0 0 20px color-mix(in srgb, var(--color-success) 50%, transparent)' : '0 0 20px color-mix(in srgb, var(--color-danger) 50%, transparent)')
    : 'none';

  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: `2px dashed ${borderColor}`,
      borderRadius: '12px',
      backgroundColor: isHovered 
        ? (data.hoverStatus === 'valid' ? 'color-mix(in srgb, var(--color-success) 5%, transparent)' : 'color-mix(in srgb, var(--color-danger) 5%, transparent)')
        : 'color-mix(in srgb, var(--color-accent) 2%, transparent)',
      boxShadow,
      position: 'relative',
      transition: 'all 0.2s ease',
    }}>
      <div style={{
        position: 'absolute',
        top: '-12px',
        left: '16px',
        backgroundColor: 'var(--color-accent)',
        color: 'var(--color-white)',
        fontSize: '11px',
        fontWeight: 700,
        padding: '2px 10px',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 10,
      }}>
        <Shield size={12} />
        <span>{t('nodeviz.vpcLabel', { name: data.name || 'Lab-VPC' })}</span>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          data.onConfigure?.(data.id, data.name || 'Lab-VPC');
        }}
        style={{
          position: 'absolute',
          top: '-12px',
          right: '38px',
          backgroundColor: 'var(--bg-surface-solid)',
          border: '1px solid var(--border-color)',
          color: 'var(--color-text-secondary)',
          fontSize: '9px',
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          zIndex: 10,
        }}
        title={t('nodeviz.configureVpcTitle')}
      >
        <Settings size={10} />
        <span>{t('nodeviz.configure')}</span>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          data.onDelete?.(data.id);
        }}
        style={{
          position: 'absolute',
          top: '-12px',
          right: '16px',
          backgroundColor: 'var(--color-danger)',
          border: 'none',
          color: 'var(--color-white)',
          padding: '3px 4px',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          zIndex: 10,
        }}
        title={t('nodeviz.deleteVpc')}
      >
        <Trash size={9} />
      </button>

      {/* Visually stunning "+" Drop Zone */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        right: '16px',
        height: '48px',
        border: '2px dashed color-mix(in srgb, var(--color-accent) 25%, transparent)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-accent)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.5px',
        gap: '6px',
        pointerEvents: 'none',
        backgroundColor: 'color-mix(in srgb, var(--color-accent) 2%, transparent)',
        transition: 'all 0.2s ease',
      }}>
        <span style={{ fontSize: '14px' }}>+</span>
        <span>{t('nodeviz.dropZone')}</span>
      </div>
    </div>
  );
}
