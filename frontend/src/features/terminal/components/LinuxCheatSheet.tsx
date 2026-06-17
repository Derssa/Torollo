import { useCommandSearch } from '../hooks/useCommandSearch';
import CommandCard from './CommandCard';
import { Search } from 'lucide-react';

export default function LinuxCheatSheet() {
  const {
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    categories,
    filteredCommands,
  } = useCommandSearch();

  return (
    <div style={styles.container}>
      <div style={styles.searchBar}>
        <div style={styles.inputWrapper}>
          <Search size={16} color="var(--color-text-muted)" style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search commands, descriptions, or keywords..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
      </div>

      <div style={styles.categories}>
        <button
          style={{
            ...styles.categoryBtn,
            backgroundColor: selectedCategory === null ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
            color: selectedCategory === null ? '#FFF' : 'var(--color-text-secondary)',
          }}
          onClick={() => setSelectedCategory(null)}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            style={{
              ...styles.categoryBtn,
              backgroundColor: selectedCategory === cat ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
              color: selectedCategory === cat ? '#FFF' : 'var(--color-text-secondary)',
            }}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div style={styles.list}>
        {filteredCommands.length > 0 ? (
          filteredCommands.map(cmd => (
            <CommandCard key={cmd.name} command={cmd} />
          ))
        ) : (
          <div style={styles.empty}>
            <span style={styles.emptyText}>No matching commands found.</span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#FFFFFF',
    boxSizing: 'border-box',
    padding: '16px',
    overflowY: 'hidden',
  },
  searchBar: {
    marginBottom: '12px',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px 10px 36px',
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
    transition: 'all 0.2s',
  },
  categories: {
    display: 'flex',
    gap: '6px',
    overflowX: 'auto',
    paddingBottom: '8px',
    marginBottom: '12px',
    flexShrink: 0,
  },
  categoryBtn: {
    border: 'none',
    padding: '6px 12px',
    borderRadius: '0px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    paddingRight: '4px',
  },
  empty: {
    textAlign: 'center',
    padding: '40px 0',
  },
  emptyText: {
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  },
};
