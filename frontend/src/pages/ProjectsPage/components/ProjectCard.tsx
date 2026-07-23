import { Folder, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Project } from '../../../shared/types';

interface ProjectCardProps {
  project: Project;
  onSelect: (id: string, name: string) => void;
  onDelete: (project: Project) => void;
  isDeleting?: boolean;
}

export default function ProjectCard({ project, onSelect, onDelete, isDeleting }: ProjectCardProps) {
  const { t, i18n } = useTranslation();
  return (
    // Wrapper so the delete control can be a *sibling* of the card button —
    // a button nested inside a button is invalid HTML and breaks focus order.
    <div style={{ ...styles.wrapper, opacity: isDeleting ? 0.7 : 1 }}>
      <button
        onClick={() => onSelect(project.id, project.name)}
        style={styles.card}
        id={`project-card-${project.id}`}
        disabled={isDeleting}
      >
        <div style={styles.cardIcon}>
          <Folder size={20} color="var(--color-accent)" />
        </div>
        <div style={styles.cardBody}>
          <h2 style={styles.projectName}>{project.name}</h2>
          <p style={styles.projectMeta}>
            {new Date(project.createdAt).toLocaleDateString(i18n.language, {
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
      </button>
      <button
        onClick={() => onDelete(project)}
        style={styles.deleteBtn}
        title={t('projects.deleteProjectTooltip')}
        aria-label={t('projects.deleteProjectTooltip')}
        id={`delete-project-${project.id}`}
        disabled={isDeleting}
      >
        <Trash2 size={14} />
      </button>
      {isDeleting && (
        <div style={styles.loadingOverlay}>
          <Loader2 className="spin" size={24} color="var(--color-accent)" />
          <span style={styles.deletingLabel}>{t('projects.deleting')}</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
  },
  card: {
    width: '100%',
    padding: 'var(--space-6)',
    borderRadius: 'var(--radius-lg)',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    textAlign: 'left',
    height: '190px',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-sm)',
    fontFamily: 'var(--font-sans)',
  },
  cardIcon: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-accent-glow)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    position: 'absolute',
    top: 'var(--space-5)',
    right: 'var(--space-5)',
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: 'var(--space-2)',
    borderRadius: 'var(--radius-sm)',
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
    margin: '0 0 var(--space-1) 0',
    letterSpacing: '-0.2px',
  },
  projectMeta: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-accent)',
    fontSize: 'var(--text-md)',
    fontWeight: 500,
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-lg)',
    zIndex: 10,
  },
  deletingLabel: {
    fontSize: 'var(--text-xs)',
    marginTop: 'var(--space-2)',
    color: 'var(--color-text-secondary)',
    fontWeight: 600,
  },
};
