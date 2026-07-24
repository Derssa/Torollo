import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, GraduationCap } from 'lucide-react';
import Button from '../../../../shared/components/Button';
import { useRoadmaps } from '../../../../features/learning/hooks/useRoadmaps';
import { useLearningProgressSummaries } from '../../../../features/learning/hooks/useLearningProgressSummaries';
import { filterByUiLanguage } from '../../../../features/learning/roadmapLanguage';
import LearningHero from './LearningHero';
import RoadmapShowcaseCard from './RoadmapShowcaseCard';
import WhyPanel from './WhyPanel';
import Skeleton from '../../../../shared/components/Skeleton';
import type { ProgressEntrySummary, RoadmapSummary } from '../../../../shared/types/roadmap';

interface LearningSectionProps {
  /** Opens the roadmap's briefing page — launching happens from there. */
  onOpenRoadmap: (summary: RoadmapSummary, progress?: ProgressEntrySummary) => void;
}

export default function LearningSection({ onOpenRoadmap }: LearningSectionProps) {
  const { t, i18n } = useTranslation();
  const { summaries, loading, error, fetchRoadmaps } = useRoadmaps();
  const { byRoadmapId, fetchProgress } = useLearningProgressSummaries();
  const roadmapsPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRoadmaps();
    fetchProgress();
  }, [fetchRoadmaps, fetchProgress]);

  const visible = filterByUiLanguage(summaries, i18n.language);
  // Started roadmaps first, most recently played on top; the rest keep
  // catalogue order (DESIGN §4.2).
  const sorted = [...visible].sort((a, b) => {
    const pa = byRoadmapId[a.id]?.updatedAt ?? '';
    const pb = byRoadmapId[b.id]?.updatedAt ?? '';
    if (pa !== pb) return pb.localeCompare(pa);
    return 0;
  });

  const heroTarget = sorted[0];

  const browseToRoadmaps = () => {
    roadmapsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    roadmapsPanelRef.current?.focus({ preventScroll: true });
  };

  return (
    <section>
      <div style={styles.titleRow}>
        <GraduationCap size={18} color="var(--color-accent)" />
        <h2 style={styles.title}>{t('learning.landing.title')}</h2>
      </div>
      <p style={styles.subtitle}>{t('learning.landing.subtitle')}</p>

      <div style={styles.columns}>
        <div style={styles.main}>
          {heroTarget && (
            <LearningHero
              onStart={() => onOpenRoadmap(heroTarget, byRoadmapId[heroTarget.id])}
              onBrowse={browseToRoadmaps}
            />
          )}

          <div ref={roadmapsPanelRef} tabIndex={-1} style={styles.roadmapsPanel}>
            <div style={styles.roadmapsTitleRow}>
              <BookOpen size={16} color="var(--color-accent)" />
              <h4 style={styles.roadmapsTitle}>{t('learning.landing.roadmapsTitle')}</h4>
            </div>
            {loading ? (
              <div style={styles.cardList} aria-busy="true">
                <Skeleton height="96px" />
                <Skeleton height="96px" />
              </div>
            ) : error ? (
              <div style={styles.status}>
                <span>{t('learning.catalog.error')}</span>
                <Button onClick={fetchRoadmaps}>{t('learning.catalog.retry')}</Button>
              </div>
            ) : sorted.length === 0 ? (
              <div style={styles.status}>{t('learning.catalog.empty')}</div>
            ) : (
              <div style={styles.cardList}>
                {sorted.map(summary => (
                  <RoadmapShowcaseCard
                    key={`${summary.id}-${summary.language}`}
                    summary={summary}
                    progress={byRoadmapId[summary.id]}
                    onOpen={() => onOpenRoadmap(summary, byRoadmapId[summary.id])}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={styles.side}>
          <WhyPanel />
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  title: {
    fontSize: 'var(--text-xl)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: 'var(--text-md)',
    color: 'var(--color-text-secondary)',
    margin: 'var(--space-1) 0 var(--space-4) 0',
  },
  columns: {
    display: 'flex',
    gap: 'var(--space-5)',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  main: {
    flex: '2 1 480px',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
    minWidth: 0,
  },
  side: {
    flex: '1 1 280px',
    minWidth: 0,
  },
  // The roadmap cards sit directly on the page background (mockup look) —
  // no wrapping panel chrome, just the header row and the grid.
  roadmapsPanel: {
    outline: 'none',
  },
  roadmapsTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    margin: '0 0 var(--space-4) 0',
  },
  roadmapsTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  cardList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 'var(--space-4)',
  },
  status: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-6) var(--space-4)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-muted)',
    textAlign: 'center',
  },
};
