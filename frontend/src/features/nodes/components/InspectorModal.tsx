import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { inspectorStyles as styles } from './inspectorStyles';

export interface InspectorTab {
  id: string;
  label: string;
  icon: ReactNode;
}

/**
 * Tab content wrapper: a tab mounts on first activation and then stays
 * mounted but hidden, so its state (search text, tree expansion, running
 * simulation) survives tab switches — matching the previous behavior where
 * all tab state was hoisted in the modal — while keeping the initial render
 * as light as it used to be.
 */
export function TabPanel({ visible, children }: { visible: boolean; children: ReactNode }) {
  const [hasBeenVisible, setHasBeenVisible] = useState(visible);

  useEffect(() => {
    if (visible && !hasBeenVisible) setHasBeenVisible(true);
  }, [visible, hasBeenVisible]);

  if (!hasBeenVisible && !visible) return null;

  return (
    <div style={{ height: '100%', display: visible ? undefined : 'none' }}>
      {children}
    </div>
  );
}

interface InspectorModalProps {
  tabs: InspectorTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Shared shell of the DB inspector modals: overlay, glass panel, tab bar and
 * close button. Closes only via the X button on purpose — ESC/overlay-click
 * would be too easy to hit while typing queries in the shell tab.
 */
export default function InspectorModal({ tabs, activeTab, onTabChange, onClose, children }: InspectorModalProps) {
  return (
    <div style={styles.overlay}>
      <div style={styles.container} className="glass">
        <div style={styles.header}>
          <div style={styles.tabs}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                style={{ ...styles.tabBtn, ...(activeTab === tab.id ? styles.activeTabBtn : {}) }}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.body}>
          {children}
        </div>
      </div>
    </div>
  );
}
