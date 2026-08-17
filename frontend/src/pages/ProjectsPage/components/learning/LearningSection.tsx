import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, GraduationCap } from 'lucide-react';
import Button from '../../../../shared/components/Button';
import { useRoadmaps } from '../../../../features/learning/hooks/useRoadmaps';
import ImportRoadmapsButton from '../../../../features/learning/components/ImportRoadmapsButton';
import { useLearningProgressSummaries } from '../../../../features/learning/hooks/useLearningProgressSummaries';
import { filterByUiLanguage } from '../../../../features/learning/roadmapLanguage';
import { hasSeenLearningPitch } from '../../../../features/learning/onboarding';
import LearningHero from './LearningHero';
import RoadmapShowcaseCard from './RoadmapShowcaseCard';
import WhyPanel from './WhyPanel';
import ResumeCard from './ResumeCard';
import Receipt from '../../../../shared/components/Receipt';
import { SAMPLE_CHECKS, SAMPLE_CONTEXT, SAMPLE_FOOTER, SAMPLE_RECEIPT_TEXT } from './sampleReceipt';
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
  // Read once per mount: launching a roadmap sets the flag, and the hero must
  // not vanish under the click that used it.
  const [pitchSeen] = useState(hasSeenLearningPitch);

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

  // Two audiences, two pages. Someone who has already started one roadmap
  // gets a single question answered — "where was I?" — and the catalogue.
  // Someone who has never started anything gets the pitch instead: the hero,
  // the why-panel and the sample receipt. Showing both to everyone buried the
  // resume link below the fold.
  const resumeTarget = sorted.find(s => {
    const p = byRoadmapId[s.id];
    return p && p.completedSteps > 0 && p.completedSteps < s.stepCount;
  });
  const isFirstRun =
    !pitchSeen && !sorted.some(s => (byRoadmapId[s.id]?.completedSteps ?? 0) > 0);
  // The pitch always opens on the same roadmap: the first of the catalogue,
  // which the backend serves in its curated order (`CURATED_ROADMAP_ORDER`).
  // `sorted` is the progress-first order and would pitch whatever was touched
  // last — right for the list, wrong for an introduction.
  const flagship = visible[0];

  const browseToRoadmaps = () => {
    roadmapsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    roadmapsPanelRef.current?.focus({ preventScroll: true });
  };

  return (
    <section>
      <div style={styles.titleRow}>
        <GraduationCap size={18} color="var(--color-text-muted)" />
        <h2 style={styles.title}>{t('learning.landing.title')}</h2>
      </div>
      <p style={styles.subtitle}>{t('learning.landing.subtitle')}</p>

      <div style={isFirstRun ? styles.columns : undefined}>
        <div style={isFirstRun ? styles.main : styles.single}>
          {isFirstRun && flagship && (
            <LearningHero
              onStart={() => onOpenRoadmap(flagship, byRoadmapId[flagship.id])}
              onBrowse={browseToRoadmaps}
            />
          )}

          {/* The evidence card needs the wide column: its value column only
              aligns when nothing wraps (DESIGN §2). */}
          {isFirstRun && (
            <Receipt
              label={t('learning.landing.sampleReceiptLabel')}
              verdict={t('learning.landing.sampleReceipt.verdict')}
              context={SAMPLE_CONTEXT}
              checks={SAMPLE_CHECKS}
              footer={SAMPLE_FOOTER}
              copyText={SAMPLE_RECEIPT_TEXT}
            />
          )}

          {resumeTarget && (
            <ResumeCard
              summary={resumeTarget}
              progress={byRoadmapId[resumeTarget.id] as ProgressEntrySummary}
              onResume={() => onOpenRoadmap(resumeTarget, byRoadmapId[resumeTarget.id])}
            />
          )}

          <div ref={roadmapsPanelRef} tabIndex={-1} style={styles.roadmapsPanel}>
            <div style={styles.roadmapsTitleRow}>
              <BookOpen size={16} color="var(--color-text-muted)" />
              <h4 style={styles.roadmapsTitle}>{t('learning.landing.roadmapsTitle')}</h4>
              <div style={styles.roadmapsActions}>
                <ImportRoadmapsButton onImported={fetchRoadmaps} />
              </div>
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

        {isFirstRun && (
          <div style={styles.side}>
            <WhyPanel />
          </div>
        )}
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
  // Returning users get one column: resume card, then the catalogue.
  single: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
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
  roadmapsActions: {
    marginLeft: 'auto',
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
