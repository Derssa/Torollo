import type { ReactNode } from 'react';
import { Play } from 'lucide-react';
import { inspectorStyles as styles } from './inspectorStyles';

interface QueryShellTabProps {
  promptLabel: string;
  /** Extra control next to the prompt label (e.g. Postgres' target-DB select). */
  headerExtra?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  executing: boolean;
  output: string;
  labels: {
    placeholder: string;
    execute: string;
    executing: string;
    consoleTitle: string;
    emptyOutput: string;
  };
}

/** Query textarea + run button + console output pane. Execution stays per-DB. */
export default function QueryShellTab({
  promptLabel,
  headerExtra,
  value,
  onChange,
  onExecute,
  executing,
  output,
  labels,
}: QueryShellTabProps) {
  return (
    <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column' }}>
      <div style={styles.shellHeader}>
        <div style={styles.promptRow}>
          <span style={styles.label}>{promptLabel}</span>
          {headerExtra}
        </div>
        <button
          onClick={onExecute}
          disabled={executing || !value.trim()}
          style={styles.runBtn}
        >
          <Play size={14} style={{ marginRight: 6 }} fill="#FFF" />
          {executing ? labels.executing : labels.execute}
        </button>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={labels.placeholder}
        style={styles.queryTextarea}
      />

      <div style={styles.terminalHeader}>{labels.consoleTitle}</div>
      <pre style={styles.terminalOutput}>
        <code>{output || labels.emptyOutput}</code>
      </pre>
    </div>
  );
}
