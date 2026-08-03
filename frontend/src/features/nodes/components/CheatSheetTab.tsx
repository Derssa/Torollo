import { useState } from 'react';
import { Search, Copy, Check } from 'lucide-react';
import { inspectorStyles as styles } from './inspectorStyles';

export interface CheatSheetEntry {
  name: string;
  category: string;
  description: string;
  example: string;
}

interface CheatSheetTabProps {
  entries: CheatSheetEntry[];
  searchPlaceholder: string;
}

/** Searchable, copyable command reference. Content comes from a per-DB JSON file. */
export default function CheatSheetTab({ entries, searchPlaceholder }: CheatSheetTabProps) {
  const [cheatQuery, setCheatQuery] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCheat = (code: string, idx: number) => {
    // navigator.clipboard is undefined on non-secure origins (e.g. http://<LAN-ip>);
    // guard + catch so a copy failure never throws and we only flash the check on success.
    navigator.clipboard?.writeText(code)
      .then(() => {
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2000);
      })
      .catch(() => { /* clipboard unavailable; nothing copied */ });
  };

  const filteredEntries = entries.filter(item => {
    const query = cheatQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    );
  });

  return (
    <div style={{ ...styles.tabContent, display: 'flex', flexDirection: 'column' }}>
      <div style={styles.searchBar}>
        <div style={styles.searchWrapper}>
          <Search size={15} color="var(--color-text-muted)" style={styles.searchIcon} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={cheatQuery}
            onChange={(e) => setCheatQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
      </div>

      <div style={styles.cheatSheetList}>
        {filteredEntries.map((item, idx) => (
          <div key={item.name} style={styles.cheatCard}>
            <div style={styles.cheatHeader}>
              <span style={styles.cheatName}>{item.name}</span>
              <span style={styles.cheatCategory}>{item.category}</span>
            </div>
            <p style={styles.cheatDesc}>{item.description}</p>
            <div style={styles.codeContainer}>
              <pre style={styles.code}>
                <code>{item.example}</code>
              </pre>
              <button
                onClick={() => handleCopyCheat(item.example, idx)}
                style={styles.copyBtn}
              >
                {copiedIndex === idx ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
