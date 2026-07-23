import { useTranslation } from 'react-i18next';
import { BookOpen, Plus } from 'lucide-react';
import Button from '../../../shared/components/Button';
import logo from '../../../assets/logo.png';

interface PageHeaderProps {
  onNewProject: () => void;
}

declare const __APP_VERSION__: string;

const DOCS_URL = 'https://github.com/Derssa/torollo#readme';

export default function PageHeader({ onNewProject }: PageHeaderProps) {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'fr' ? 'en' : 'fr';
    i18n.changeLanguage(nextLang);
    localStorage.setItem('torollo_lang', nextLang);
  };

  return (
    <div style={styles.header}>
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
        <Button variant="primary" size="lg" onClick={onNewProject} id="create-project-btn">
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
