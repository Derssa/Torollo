import { useState } from 'react';
import CanvasPage from '../pages/CanvasPage/CanvasPage';
import TerminalModal from '../features/terminal/components/TerminalModal';

interface TerminalInfo {
  id: string;
  name: string;
}

function App() {
  const [activeTerminal, setActiveTerminal] = useState<TerminalInfo | null>(null);

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <CanvasPage 
        onTerminalOpen={(id, name) => setActiveTerminal({ id, name })} 
      />

      {activeTerminal && (
        <TerminalModal
          containerId={activeTerminal.id}
          nodeName={activeTerminal.name}
          onClose={() => setActiveTerminal(null)}
        />
      )}
    </div>
  );
}

export default App;
