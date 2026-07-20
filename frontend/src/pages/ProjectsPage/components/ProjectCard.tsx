import { Folder, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Project } from '../../../shared/types';

interface ProjectCardProps {
  project: Project;
  onSelect: (id: string, name: string) => void;
  onDelete: (project: Project, event: React.MouseEvent) => void;
  isDeleting?: boolean;
}

export default function ProjectCard({ project, onSelect, onDelete, isDeleting }: ProjectCardProps) {
  const { t } = useTranslation();
  return (
    <div
      onClick={() => !isDeleting && onSelect(project.id, project.name)}
      style={{
        ...styles.card,
        position: 'relative',
        opacity: isDeleting ? 0.7 : 1,
        pointerEvents: isDeleting ? 'none' : 'auto',
      }}
      id={`project-card-${project.id}`}
    >
      {isDeleting && (
        <div style={styles.loadingOverlay}>
          <Loader2 className="spin" size={24} color="var(--color-accent)" />
          <span style={{ fontSize: '11px', marginTop: '6px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{t('projects.deleting')}</span>
        </div>
      )}
      <div style={styles.cardHeader}>
        <div style={styles.cardIcon}>
          <Folder size={20} color="var(--color-accent)" />
        </div>
        <button
          onClick={(e) => !isDeleting && onDelete(project, e)}
          style={styles.deleteBtn}
          title={t('projects.deleteProjectTooltip')}
          id={`delete-project-${project.id}`}
          disabled={isDeleting}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div style={styles.cardBody}>
        <h2 style={styles.projectName}>{project.name}</h2>
        <p style={styles.projectMeta}>
          {new Date(project.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      </div>
      <div style={styles.cardFooter}>
        <span>{t('projects.openStack')}</span>
        <ArrowRight size={14} style={{ marginLeft: 6 }} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: '24px',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s',
    display: 'flex',
    flexDirection: 'column',
    height: '190px',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'var(--color-accent-glow)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s, background 0.2s',
  },
  cardBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  projectName: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    margin: '0 0 4px 0',
    letterSpacing: '-0.2px',
  },
  projectMeta: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-accent)',
    fontSize: '13px',
    fontWeight: 500,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '16px',
    zIndex: 10,
  },
};
