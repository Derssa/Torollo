import { useTranslation } from 'react-i18next';
import Button from '../../../shared/components/Button';
import ProjectCard from './ProjectCard';
import ProjectCardSkeleton from './ProjectCardSkeleton';
import FirstRunHero from './FirstRunHero';
import type { Project } from '../../../shared/types';

interface ProjectsSectionProps {
  projects: Project[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onSelect: (id: string, name: string) => void;
  onDelete: (project: Project) => void;
  deletingIds: string[];
  onStartLearning: () => void;
  onStartScratch: () => void;
}

export default function ProjectsSection({
  projects,
  loading,
  error,
  onRetry,
  onSelect,
  onDelete,
  deletingIds,
  onStartLearning,
  onStartScratch,
}: ProjectsSectionProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <section aria-busy="true" aria-label={t('projects.loadingAria')}>
        <span style={styles.eyebrow}>{t('projects.sectionTitle')}</span>
        <div style={styles.grid}>
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <span style={styles.eyebrow}>{t('projects.sectionTitle')}</span>
        <div style={styles.errorBox}>
          <span style={styles.errorText}>{t('projects.loadError')}</span>
          <Button onClick={onRetry}>{t('projects.retry')}</Button>
        </div>
      </section>
    );
  }

  if (projects.length === 0) {
    return (
      <section>
        <FirstRunHero onStartLearning={onStartLearning} onStartScratch={onStartScratch} />
      </section>
    );
  }

  return (
    <section>
      <span style={styles.eyebrow}>{t('projects.sectionTitle')}</span>
      <div style={styles.grid}>
        {projects.map(p => (
          <ProjectCard
            key={p.id}
            project={p}
            onSelect={onSelect}
            onDelete={onDelete}
            isDeleting={deletingIds.includes(p.id)}
          />
        ))}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  eyebrow: {
    display: 'block',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-muted)',
    marginBottom: 'var(--space-3)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 'var(--space-5)',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-4) var(--space-5)',
    border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)',
    background: 'var(--color-danger-glow)',
    borderRadius: 'var(--radius-md)',
  },
  errorText: {
    flex: 1,
    fontSize: 'var(--text-md)',
    color: 'var(--color-text-primary)',
  },
};
