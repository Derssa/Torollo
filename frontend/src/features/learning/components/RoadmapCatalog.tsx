import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoadmaps } from '../hooks/useRoadmaps';
import type { RoadmapSummary } from '../../../shared/types/roadmap';

interface RoadmapCatalogProps {
  onOpen: (summary: RoadmapSummary) => void;
}

export default function RoadmapCatalog({ onOpen }: RoadmapCatalogProps) {
  const { t, i18n } = useTranslation();
  const { summaries, loading, error, fetchRoadmaps } = useRoadmaps();

  useEffect(() => {
    fetchRoadmaps();
  }, [fetchRoadmaps]);

  // Only surface roadmaps authored in the active UI language: an English user
  // sees English roadmaps only. Compare on the base subtag so 'en-US' still
  // matches an 'en' roadmap. Re-evaluated on every render, so toggling the
  // language in the topbar re-filters the catalogue immediately.
  const uiLanguage = i18n.language.split('-')[0];
  const visibleSummaries = summaries.filter(
    summary => summary.language.split('-')[0] === uiLanguage
  );

  if (loading) {
    return <div style={styles.status}>{t('learning.catalog.loading')}</div>;
  }

  if (error) {
    return (
      <div style={styles.status}>
        <span>{t('learning.catalog.error')}</span>
        <button onClick={fetchRoadmaps} style={styles.retryBtn}>
          {t('learning.catalog.retry')}
        </button>
      </div>
    );
  }

  if (visibleSummaries.length === 0) {
    return <div style={styles.status}>{t('learning.catalog.empty')}</div>;
  }

  return (
    <div style={styles.list}>
      {visibleSummaries.map(summary => (
        <button
          key={`${summary.id}-${summary.language}`}
          onClick={() => onOpen(summary)}
          style={styles.card}
        >
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>{summary.title}</span>
          </div>
          <span style={styles.cardDescription}>{summary.description}</span>
          <div style={styles.cardMeta}>
            {summary.difficulty && (
              <span>{t(`learning.catalog.difficulty.${summary.difficulty}`)}</span>
            )}
            <span>{t('learning.catalog.steps', { count: summary.stepCount })}</span>
            {summary.estimatedMinutes != null && (
              <span>{t('learning.catalog.minutes', { count: summary.estimatedMinutes })}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  status: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '24px 16px',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
  },
  retryBtn: {
    padding: '6px 14px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    background: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '12px',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font-sans)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  cardDescription: {
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  cardMeta: {
    display: 'flex',
    gap: '10px',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
};
