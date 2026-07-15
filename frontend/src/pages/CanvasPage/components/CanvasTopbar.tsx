import { ArrowLeft, RefreshCw, Save, Network, Play, GraduationCap } from 'lucide-react';
import logo from '../../../assets/logo.png';
import { useTranslation } from 'react-i18next';

interface CanvasTopbarProps {
  projectName: string;
  loading: boolean;
  creating?: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onConfigureVpc: () => void;
  onSimulateTraffic: () => void;
  onToggleLearning: () => void;
}

declare const __APP_VERSION__: string;

export default function CanvasTopbar({
  projectName,
  loading,
  onBack,
  onRefresh,
  onSave,
  onConfigureVpc,
  onSimulateTraffic,
  onToggleLearning,
}: CanvasTopbarProps) {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'fr' ? 'en' : 'fr';
    i18n.changeLanguage(nextLang);
    localStorage.setItem('torollo_lang', nextLang);
  };

  return (
    <div style={styles.topbar} className="glass">
      <div style={styles.brand}>
        <button onClick={onBack} style={styles.backBtn} title={t('topbar.backToProjects')}>
          <ArrowLeft size={16} />
        </button>
        <div style={styles.iconWrap}>
          <img src={logo} alt="Logo" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
        </div>
        <span style={styles.brandTitle}>{projectName}</span>
        <span style={styles.badge}>v{__APP_VERSION__}</span>
      </div>

      <div style={styles.actions}>
        <button
          onClick={toggleLanguage}
          style={{...styles.saveBtn, padding: '0 10px', minWidth: '40px'}}
          title="Toggle Language"
        >
          {i18n.language.toUpperCase()}
        </button>

        <button
          onClick={onRefresh}
          style={styles.refreshBtn}
          disabled={loading}
          title={t('topbar.refreshNodes')}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>

        <button onClick={onToggleLearning} style={styles.saveBtn} title={t('topbar.learning')}>
          <GraduationCap size={16} style={{ marginRight: 6 }} />
          {t('topbar.learning')}
        </button>

        <button onClick={onConfigureVpc} style={styles.saveBtn} title={t('topbar.vpcSettings')}>
          <Network size={16} style={{ marginRight: 6 }} />
          {t('topbar.vpcSettings')}
        </button>

        <button onClick={onSimulateTraffic} style={styles.saveBtn} title={t('topbar.trafficSimulator')}>
          <Play size={16} style={{ marginRight: 6 }} />
          {t('topbar.trafficSimulator')}
        </button>

        <button onClick={onSave} style={styles.saveBtn} title={t('topbar.saveGraph')}>
          <Save size={16} style={{ marginRight: 6 }} />
          {t('topbar.saveGraph')}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    zIndex: 10,
    borderBottom: '1px solid var(--border-color)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  backBtn: {
    background: 'rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  brandTitle: {
    fontWeight: 700,
    fontSize: '18px',
    letterSpacing: '-0.5px',
    color: 'var(--color-text-primary)',
  },
  badge: {
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: 'var(--color-accent-glow)',
    color: 'var(--color-accent)',
    padding: '2px 10px',
    borderRadius: '12px',
    border: '1px solid rgba(37, 99, 235, 0.2)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  refreshBtn: {
    background: 'rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    width: '38px',
    height: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  saveBtn: {
    backgroundColor: 'var(--bg-surface-solid)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '0 16px',
    height: '38px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  addBtn: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFF',
    border: 'none',
    borderRadius: '10px',
    padding: '0 18px',
    height: '38px',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s, transform 0.1s',
    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.3)',
  },
  iconWrap: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: '#FFFFFF',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '6px',
  },
};
