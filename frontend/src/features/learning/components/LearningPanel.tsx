import { useTranslation } from 'react-i18next';
import { GraduationCap, X } from 'lucide-react';
import { useLearningPlayer } from '../hooks/useLearningPlayer';
import RoadmapCatalog from './RoadmapCatalog';
import RoadmapPlayer from './RoadmapPlayer';

interface LearningPanelProps {
  projectId: string;
  onClose: () => void;
}

/**
 * The roadmap player sidebar. Sits to the LEFT of the canvas (NodeLibrary
 * owns the right) and is only mounted while open, so the free-canvas
 * experience is untouched when the learner is not in a roadmap.
 */
export default function LearningPanel({ projectId, onClose }: LearningPanelProps) {
  const { t } = useTranslation();
  const player = useLearningPlayer({ projectId });

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <GraduationCap size={16} color="var(--color-accent)" style={{ marginRight: 8 }} />
          <span>{t('learning.panelTitle')}</span>
        </div>
        <button onClick={onClose} style={styles.closeBtn} title={t('learning.close')}>
          <X size={16} />
        </button>
      </div>

      <div style={styles.content}>
        {player.roadmap ? (
          <RoadmapPlayer player={player} />
        ) : player.roadmapLoading ? (
          <div style={styles.loading}>{t('learning.player.loading')}</div>
        ) : (
          <>
            {player.roadmapError !== null && (
              <div style={styles.status}>
                {player.roadmapError || t('learning.player.loadError')}
              </div>
            )}
            {/* Single JSX position: the catalog must not remount (and refetch) when a load error appears. */}
            <RoadmapCatalog onOpen={player.openRoadmap} />
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '300px',
    backgroundColor: 'var(--bg-surface-solid)',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    flexShrink: 0,
    zIndex: 5,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    borderBottom: '1px solid var(--border-color)',
    height: '57px',
    boxSizing: 'border-box',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    fontWeight: 700,
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.2px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  loading: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
    padding: '24px 16px',
  },
  status: {
    fontSize: '12px',
    color: 'var(--color-danger)',
    lineHeight: 1.5,
    marginBottom: '12px',
  },
};
