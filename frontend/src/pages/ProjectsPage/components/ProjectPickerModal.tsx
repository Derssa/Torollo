import { useTranslation } from 'react-i18next';
import { ArrowRight, Folder, Plus } from 'lucide-react';
import Modal from '../../../shared/components/Modal';
import Button from '../../../shared/components/Button';
import type { Project } from '../../../shared/types';

interface ProjectPickerModalProps {
  projects: Project[];
  roadmapTitle: string;
  onPick: (project: Project) => void;
  onNewProject: () => void;
  onCancel: () => void;
}

/** A roadmap validates against one project's containers — ask which one. */
export default function ProjectPickerModal({
  projects,
  roadmapTitle,
  onPick,
  onNewProject,
  onCancel,
}: ProjectPickerModalProps) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onCancel} width="440px">
      <h2 style={styles.title}>{t('learning.landing.pickProjectTitle')}</h2>
      <p style={styles.body}>{t('learning.landing.pickProjectBody', { roadmap: roadmapTitle })}</p>
      <div style={styles.list}>
        {projects.map(project => (
          <button key={project.id} onClick={() => onPick(project)} style={styles.row}>
            <Folder size={15} color="var(--color-accent)" />
            <span style={styles.rowName}>{project.name}</span>
            <ArrowRight size={14} color="var(--color-text-muted)" />
          </button>
        ))}
      </div>
      <div style={styles.footer}>
        <Button onClick={onNewProject}>
          <Plus size={14} />
          {t('learning.landing.pickProjectNew')}
        </Button>
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    fontSize: 'var(--text-xl)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: '0 0 var(--space-2) 0',
  },
  body: {
    fontSize: 'var(--text-md)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    margin: '0 0 var(--space-4) 0',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    maxHeight: '260px',
    overflowY: 'auto',
    marginBottom: 'var(--space-4)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font-sans)',
    transition: 'border-color 0.15s ease',
  },
  rowName: {
    flex: 1,
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
  },
};
