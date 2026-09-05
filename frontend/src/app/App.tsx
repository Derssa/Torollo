import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ProjectsPage from '../pages/ProjectsPage/ProjectsPage';
import { useBootTelemetry } from '../features/telemetry/useBootTelemetry';
import type { LearningExit, LearningIntent, ProjectInfo, TerminalInfo } from '../shared/types';

const CanvasPage = lazy(() => import('../pages/CanvasPage/CanvasPage'));
const TerminalModal = lazy(() => import('../features/terminal/components/TerminalModal'));

function App() {
  const { t } = useTranslation();
  useBootTelemetry();
  const [activeProject, setActiveProject] = useState<ProjectInfo | null>(() => {
    const saved = localStorage.getItem('akal-active-project');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activeTerminal, setActiveTerminal] = useState<TerminalInfo | null>(null);
  // Session-only, deliberately not persisted: a reload must never replay
  // an "open the learning panel" intent from a past navigation.
  const [learningIntent, setLearningIntent] = useState<LearningIntent | null>(null);
  // Reverse direction, same rule: where the home shell should land when the
  // completion screen sends the learner out of the canvas.
  const [learningExit, setLearningExit] = useState<LearningExit | null>(null);

  const handleSelectProject = (project: ProjectInfo | null) => {
    setActiveProject(project);
    if (project) {
      localStorage.setItem('akal-active-project', JSON.stringify(project));
    } else {
      localStorage.removeItem('akal-active-project');
    }
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      {!activeProject ? (
        <ProjectsPage
          initialLearning={learningExit}
          onInitialLearningConsumed={() => setLearningExit(null)}
          onSelectProject={(id, name, intent) => {
            setLearningIntent(intent ?? null);
            handleSelectProject({ id, name });
          }}
        />
      ) : (
        <Suspense fallback={<div className="app-loading" role="status">{t('common.loading')}</div>}>
          <CanvasPage
            projectId={activeProject.id}
            projectName={activeProject.name}
            initialLearning={learningIntent}
            onLearningIntentConsumed={() => setLearningIntent(null)}
            onBackToProjects={() => {
              handleSelectProject(null);
              setActiveTerminal(null);
            }}
            onExitToLearning={target => {
              setLearningExit(target);
              handleSelectProject(null);
              setActiveTerminal(null);
            }}
            onTerminalOpen={(id, name) => setActiveTerminal({ id, name })}
          />
        </Suspense>
      )}

      {activeProject && activeTerminal && (
        <Suspense fallback={<span className="visually-hidden" role="status">{t('common.loading')}</span>}>
          <TerminalModal
            containerId={activeTerminal.id}
            projectId={activeProject.id}
            nodeName={activeTerminal.name}
            onClose={() => setActiveTerminal(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
