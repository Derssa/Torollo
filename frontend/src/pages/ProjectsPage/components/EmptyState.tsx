import { Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function EmptyState() {
  const { t } = useTranslation();
  return (
    <div style={styles.empty}>
      <div style={styles.emptyIcon}>
        <Folder size={40} color="var(--color-text-muted)" strokeWidth={1.2} />
      </div>
      <p style={styles.emptyTitle}>{t('projects.emptyTitle')}</p>
      <p style={styles.emptyDesc}>
        {t('projects.emptyDesc')}
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '80px 0',
  },
  emptyIcon: {
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    margin: '0 0 6px 0',
  },
  emptyDesc: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    margin: 0,
  },
};
