import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import InputModal from '../../shared/components/InputModal';
import ConfirmModal from '../../shared/components/ConfirmModal';
import PageHeader from './components/PageHeader';
import SideRail from './components/SideRail';
import ProjectsSection from './components/ProjectsSection';
import type { HomeView } from './components/SideRail';
import ProjectPickerModal from './components/ProjectPickerModal';
import LearningSection from './components/learning/LearningSection';
import RoadmapDetailPage from './components/learning/detail/RoadmapDetailPage';
import { filterByUiLanguage } from '../../features/learning/roadmapLanguage';
import { API_BASE } from '../../shared/types';
import type { LearningIntent, Project } from '../../shared/types';
import type { ProgressEntrySummary, RoadmapSummary } from '../../shared/types/roadmap';

interface ProjectsPageProps {
  onSelectProject: (id: string, name: string, intent?: LearningIntent) => void;
}

/**
 * Where the home shell is. The roadmap briefing is a sub-page of Learning:
 * the rail stays on Learning while it is open, and the header shows a
 * breadcrumb back to the catalogue.
 */
type HomeRoute =
  | { kind: 'projects' }
  | { kind: 'learning' }
  | { kind: 'roadmap'; summary: RoadmapSummary; progress?: ProgressEntrySummary };

export default function ProjectsPage({ onSelectProject }: ProjectsPageProps) {
  const { t, i18n } = useTranslation();
  // Which home view the side rail is on; session-only, Projects first.
  const [route, setRoute] = useState<HomeRoute>({ kind: 'projects' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [storeRecovered, setStoreRecovered] = useState(false);
  // Roadmap waiting for a project choice in the picker modal.
  const [pickerTarget, setPickerTarget] = useState<RoadmapSummary | null>(null);
  // Learning intent to apply to the next project created through the input
  // modal (picker → "New project", or a failed auto-create fallback).
  const pendingIntentRef = useRef<LearningIntent | null>(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const res = await fetch(`${API_BASE}/api/projects`);
      const data = await res.json();
      if (res.ok && Array.isArray(data?.projects)) {
        setProjects(data.projects);
      } else {
        setLoadError(true);
      }
      // One-shot notice from the backend: the projects file was unreadable
      // and has been moved aside — keep the banner up until dismissed.
      if (data?.storeRecovered === true) {
        setStoreRecovered(true);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // A roadmap file holds one language, so switching the UI language must swap
  // the open briefing for its translation — or leave it when there is none.
  useEffect(() => {
    if (route.kind !== 'roadmap' || route.summary.language === i18n.language) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/learning/roadmaps`);
        const data = await res.json();
        if (cancelled || !res.ok || !Array.isArray(data)) return;
        const translated = filterByUiLanguage(data as RoadmapSummary[], i18n.language).find(
          summary => summary.id === route.summary.id
        );
        setRoute(current =>
          current.kind === 'roadmap' && current.summary.id === route.summary.id
            ? translated
              ? { ...current, summary: translated }
              : { kind: 'learning' }
            : current
        );
      } catch (err) {
        console.error('Failed to resolve the roadmap translation:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route, i18n.language]);

  const handleCreateProject = async (name: string) => {
    const res = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to create project');
    }
    const project: Project = await res.json();
    const intent = pendingIntentRef.current;
    pendingIntentRef.current = null;
    setShowCreateModal(false);
    if (intent) {
      onSelectProject(project.id, project.name, intent);
      return;
    }
    fetchProjects();
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setDeletingIds(prev => [...prev, id]);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        localStorage.removeItem(`akal-lab-graph-layout-${id}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      await fetchProjects();
      setDeletingIds(prev => prev.filter(x => x !== id));
    }
  };

  /** Creates a project without a dialog (DESIGN §4.1's "Start learning" path). */
  const autoCreateAndOpen = async (intent: LearningIntent) => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: t('projects.firstLabName') }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const project: Project = await res.json();
      onSelectProject(project.id, project.name, intent);
    } catch (err) {
      // Fall back to the standard dialog, which surfaces submit errors itself.
      console.error('Failed to auto-create a project:', err);
      pendingIntentRef.current = intent;
      setShowCreateModal(true);
    }
  };

  /**
   * A roadmap runs against one project's containers. Resolution order:
   * resume where it was last played → the only project → ask → create one.
   */
  const startRoadmap = (summary: RoadmapSummary, progress?: ProgressEntrySummary) => {
    const intent: LearningIntent = { roadmap: { id: summary.id, language: summary.language } };
    if (progress) {
      const played = projects.find(p => p.id === progress.projectId);
      if (played) {
        onSelectProject(played.id, played.name, intent);
        return;
      }
    }
    if (projects.length === 1) {
      onSelectProject(projects[0].id, projects[0].name, intent);
      return;
    }
    if (projects.length === 0) {
      autoCreateAndOpen(intent);
      return;
    }
    setPickerTarget(summary);
  };

  const goToLearning = () => setRoute({ kind: 'learning' });

  return (
    <div style={styles.shell}>
      <SideRail
        view={route.kind === 'projects' ? 'projects' : 'learning'}
        onNavigate={(view: HomeView) => setRoute({ kind: view })}
      />

      <div style={styles.content}>
        <div style={styles.container}>
          <PageHeader
            onNewProject={() => setShowCreateModal(true)}
            breadcrumb={
              route.kind === 'roadmap'
                ? [
                    { label: t('learning.detail.breadcrumbLearning'), onClick: goToLearning },
                    { label: t('learning.detail.breadcrumbRoadmaps'), onClick: goToLearning },
                    { label: route.summary.title },
                  ]
                : undefined
            }
          />

          {route.kind === 'projects' ? (
            <>
              {storeRecovered && (
                <div style={styles.noticeBox}>
                  <AlertTriangle
                    size={13}
                    color="var(--color-warning-strong)"
                    style={{ flexShrink: 0 }}
                  />
                  <span style={styles.noticeText}>{t('projects.storeRecovered')}</span>
                  <button
                    onClick={() => setStoreRecovered(false)}
                    style={styles.noticeDismiss}
                    aria-label={t('projects.dismissNotice')}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              <ProjectsSection
                projects={projects}
                loading={loading}
                error={loadError}
                onRetry={fetchProjects}
                onSelect={onSelectProject}
                onDelete={(project) => setDeleteTarget(project)}
                deletingIds={deletingIds}
                onStartLearning={goToLearning}
                onStartScratch={() => setShowCreateModal(true)}
              />
            </>
          ) : route.kind === 'learning' ? (
            <LearningSection
              onOpenRoadmap={(summary, progress) => setRoute({ kind: 'roadmap', summary, progress })}
            />
          ) : (
            <RoadmapDetailPage
              summary={route.summary}
              progress={route.progress}
              projectName={projects.find(p => p.id === route.progress?.projectId)?.name}
              onLaunch={() => startRoadmap(route.summary, route.progress)}
              onProgressCleared={() =>
                setRoute(current =>
                  current.kind === 'roadmap' ? { ...current, progress: undefined } : current
                )
              }
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <InputModal
          title={t('projects.createTitle')}
          label={t('projects.createLabel')}
          placeholder={t('projects.createPlaceholder')}
          submitText={t('projects.createSubmit')}
          onSubmit={handleCreateProject}
          onCancel={() => {
            pendingIntentRef.current = null;
            setShowCreateModal(false);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={t('projects.deleteTitle')}
          message={t('projects.deleteMessage', { name: deleteTarget.name })}
          confirmText={t('projects.deleteConfirm')}
          variant="danger"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {pickerTarget && (
        <ProjectPickerModal
          projects={projects}
          roadmapTitle={pickerTarget.title}
          onPick={(project) => {
            const target = pickerTarget;
            setPickerTarget(null);
            onSelectProject(project.id, project.name, {
              roadmap: { id: target.id, language: target.language },
            });
          }}
          onNewProject={() => {
            pendingIntentRef.current = {
              roadmap: { id: pickerTarget.id, language: pickerTarget.language },
            };
            setPickerTarget(null);
            setShowCreateModal(true);
          }}
          onCancel={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    height: '100%',
    minHeight: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
    overflowY: 'auto',
  },
  container: {
    padding: 'var(--space-8) 60px',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-6)',
  },
  noticeBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--color-warning)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-warning-glow)',
  },
  noticeText: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: 'var(--color-warning-strong)',
    lineHeight: 1.5,
  },
  noticeDismiss: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: 'var(--color-warning-strong)',
  },
};
