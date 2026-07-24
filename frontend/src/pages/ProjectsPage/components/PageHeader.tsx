import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronRight, Plus } from 'lucide-react';
import Button from '../../../shared/components/Button';
import logo from '../../../assets/logo.png';

export interface BreadcrumbItem {
  label: string;
  /** Navigates when set; the last crumb (the current page) has none. */
  onClick?: () => void;
}

interface PageHeaderProps {
  onNewProject: () => void;
  /** Replaces the logo + title block when the shell is on a sub-page. */
  breadcrumb?: BreadcrumbItem[];
}

declare const __APP_VERSION__: string;

const DOCS_URL = 'https://github.com/Derssa/torollo#readme';

export default function PageHeader({ onNewProject, breadcrumb }: PageHeaderProps) {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'fr' ? 'en' : 'fr';
    i18n.changeLanguage(nextLang);
    localStorage.setItem('torollo_lang', nextLang);
  };

  return (
    <div style={styles.header}>
      {breadcrumb ? (
        <nav style={styles.breadcrumb} aria-label={t('nav.main')}>
          {breadcrumb.map((crumb, index) => (
            <span key={crumb.label} style={styles.crumbRow}>
              {index > 0 && <ChevronRight size={14} color="var(--color-text-muted)" aria-hidden />}
              {crumb.onClick ? (
                <button onClick={crumb.onClick} style={styles.crumbLink}>
                  {crumb.label}
                </button>
              ) : (
                <span style={styles.crumbCurrent} aria-current="page">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      ) : (
        <div style={styles.logoRow}>
          <div style={styles.iconWrap}>
            <img src={logo} alt="" style={styles.logoImg} />
          </div>
          <div>
            <div style={styles.titleRow}>
              <h1 style={styles.title}>{t('projects.title')}</h1>
              <span style={styles.badge}>v{__APP_VERSION__}</span>
            </div>
            <p style={styles.subtitle}>{t('projects.subtitle')}</p>
          </div>
        </div>
      )}
      <div style={styles.actions}>
        <Button onClick={toggleLanguage} size="lg" title={t('topbar.toggleLanguage')}>
          {i18n.language.toUpperCase()}
        </Button>
        <a
          className="btn btn-outline btn-lg"
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
        >
          <BookOpen size={15} />
          {t('projects.docsLink')}
        </a>
        {/* On a sub-page the page's own action is the primary one, so this
            drops to outline — only one filled accent button per screen. */}
        <Button
          variant={breadcrumb ? 'outline' : 'primary'}
          size="lg"
          onClick={onNewProject}
          id="create-project-btn"
        >
          <Plus size={16} />
          {t('projects.newProject')}
        </Button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--space-1)',
    minWidth: 0,
  },
  crumbRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    minWidth: 0,
  },
  crumbLink: {
    background: 'none',
    border: 'none',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-accent)',
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  crumbCurrent: {
    padding: 'var(--space-1) var(--space-2)',
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  iconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: '28px',
    height: '28px',
    objectFit: 'contain',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  title: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: 'var(--text-md)',
    color: 'var(--color-text-muted)',
    margin: '2px 0 0 0',
  },
  badge: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    backgroundColor: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
    padding: '2px var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)',
  },
  actions: {
    display: 'flex',
    gap: 'var(--space-3)',
    alignItems: 'center',
  },
};
