import { useTranslation } from 'react-i18next';
import { LayoutGrid, GraduationCap } from 'lucide-react';
import logo from '../../../assets/logo.png';

export type HomeView = 'projects' | 'learning';

interface SideRailProps {
  view: HomeView;
  onNavigate: (view: HomeView) => void;
}

/** Dark icon rail on the home shell — switches between the two home views. */
export default function SideRail({ view, onNavigate }: SideRailProps) {
  const { t } = useTranslation();

  const items = [
    { key: 'projects', label: t('nav.projects'), Icon: LayoutGrid },
    { key: 'learning', label: t('nav.learning'), Icon: GraduationCap },
  ] as const;

  return (
    <nav style={styles.rail} aria-label={t('nav.main')}>
      <div style={styles.logoTile}>
        <img src={logo} alt="" style={styles.logoImg} />
      </div>
      <div style={styles.items}>
        {items.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`rail-btn${view === key ? ' active' : ''}`}
            onClick={() => onNavigate(key)}
            title={label}
            aria-label={label}
            aria-current={view === key ? 'page' : undefined}
          >
            <Icon size={19} />
          </button>
        ))}
      </div>
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  rail: {
    width: '56px',
    flexShrink: 0,
    background: 'var(--bg-rail)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-4) 0',
    gap: 'var(--space-6)',
  },
  logoTile: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-surface-solid)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: '24px',
    height: '24px',
    objectFit: 'contain',
  },
  items: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
};
