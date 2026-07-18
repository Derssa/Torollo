import { useState } from 'react';
import CanvasPage from '../pages/CanvasPage/CanvasPage';
import TerminalModal from '../features/terminal/components/TerminalModal';
import ProjectsPage from '../pages/ProjectsPage/ProjectsPage';
import type { ProjectInfo, TerminalInfo } from '../shared/types';

function App() {
  const [activeProject, setActiveProject] = useState<ProjectInfo | null>(() => {
    const saved = localStorage.getItem('akal-active-project');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activeTerminal, setActiveTerminal] = useState<TerminalInfo | null>(null);

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
          onSelectProject={(id, name) => handleSelectProject({ id, name })} 
        />
      ) : (
        <CanvasPage 
          projectId={activeProject.id}
          projectName={activeProject.name}
          onBackToProjects={() => {
            handleSelectProject(null);
            setActiveTerminal(null);
          }}
          onTerminalOpen={(id, name) => setActiveTerminal({ id, name })} 
        />
      )}

      {activeProject && activeTerminal && (
        <TerminalModal
          containerId={activeTerminal.id}
          projectId={activeProject.id}
          nodeName={activeTerminal.name}
          onClose={() => setActiveTerminal(null)}
        />
      )}
    </div>
  );
}

export default App;
