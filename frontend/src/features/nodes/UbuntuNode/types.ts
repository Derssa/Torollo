export interface UbuntuNodeData {
  id: string;
  name: string;
  state: string; // 'running' | 'exited'
  status: string;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onTerminalOpen: (id: string, name: string) => void;
}
