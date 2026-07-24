import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../../../../shared/components/Button';
import ConfirmModal from '../../../../../shared/components/ConfirmModal';
import Skeleton from '../../../../../shared/components/Skeleton';
import { useDockerHealth } from '../../../../../shared/hooks/useDockerHealth';
import { useRoadmapDetail } from '../../../../../features/learning/hooks/useRoadmapDetail';
import { deriveTopology } from '../../../../../features/learning/roadmapTopology';
import { readErrorMessage } from '../../../../../shared/utils/readErrorMessage';
import { API_BASE } from '../../../../../shared/types';
import ArchitecturePreview from './ArchitecturePreview';
import LaunchFooter from './LaunchFooter';
import PrerequisitesPanel from './PrerequisitesPanel';
import RoadmapDetailHero from './RoadmapDetailHero';
import RoadmapStatsStrip from './RoadmapStatsStrip';
import StepOutline from './StepOutline';
import VerificationPanel from './VerificationPanel';
import type { LastRun } from './VerificationPanel';
import type { ProgressEntrySummary, RoadmapSummary } from '../../../../../shared/types/roadmap';

interface RoadmapDetailPageProps {
  summary: RoadmapSummary;
  /** Most recent play-through of this roadmap, across all projects. */
  progress?: ProgressEntrySummary;
  /** Name of the project in `progress`, when it still exists. */
  projectName?: string;
  onLaunch: () => void;
  /** Called after progress was cleared, so the catalogue can refresh. */
  onProgressCleared: () => void;
}

/**
 * The briefing a learner reads before spinning up containers: what the
 * roadmap builds, how it is graded, what they need, and one launch action.
 *
 * Everything shown is real — step titles come from the roadmap file, the
 * topology and skills are read off its validators, and progress comes from
 * the learner's own play-through.
 */
export default function RoadmapDetailPage({
  summary,
  progress,
  projectName,
  onLaunch,
  onProgressCleared,
}: RoadmapDetailPageProps) {
  const { t } = useTranslation();
  const { roadmap, stepProgress, loading, error, fetchDetail } = useRoadmapDetail();
  const { status: docker, check: checkDocker } = useDockerHealth();
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const projectId = progress?.projectId;

  useEffect(() => {
    fetchDetail({ id: summary.id, language: summary.language, projectId });
  }, [fetchDetail, summary.id, summary.language, projectId]);

  useEffect(() => {
    checkDocker();
  }, [checkDocker]);

  const topology = useMemo(() => (roadmap ? deriveTopology(roadmap) : null), [roadmap]);

  const steps = useMemo(() => roadmap?.steps ?? [], [roadmap]);
  const passedStepIds = useMemo(() => {
    const passed: Record<string, boolean> = {};
    // Walking the roadmap's steps drops progress of step ids the file no
    // longer contains — same rule as the player.
    for (const step of steps) {
      if (stepProgress[step.id]?.passed) passed[step.id] = true;
    }
    return passed;
  }, [steps, stepProgress]);

  const passedCount = Object.keys(passedStepIds).length;
  const started = passedCount > 0;
  // Where the player would resume: the first step not yet passed.
  const resumeIndex = steps.findIndex(step => !passedStepIds[step.id]);
  const currentIndex = started ? (resumeIndex === -1 ? steps.length - 1 : resumeIndex) : -1;

  const lastRun: LastRun | undefined =
    started && projectName
      ? {
          projectName,
          passed: passedCount,
          total: steps.length,
          lastCheckedAt: latestCheck(stepProgress),
          nextStepTitle: resumeIndex === -1 ? undefined : steps[resumeIndex]?.title,
        }
      : undefined;

  const handleRestart = async () => {
    if (!projectId) return;
    setConfirmRestart(false);
    setRestartError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/learning/progress/${encodeURIComponent(projectId)}/${encodeURIComponent(summary.id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        setRestartError(await readErrorMessage(res, ''));
        return;
      }
      onProgressCleared();
      fetchDetail({ id: summary.id, language: summary.language });
    } catch (err) {
      console.error('Failed to reset roadmap progress:', err);
      setRestartError('');
    }
  };

  if (loading) {
    return (
      <div style={styles.page} aria-busy="true" aria-label={t('learning.detail.loading')}>
        <Skeleton height="56px" width="60%" />
        <Skeleton height="86px" />
        <div style={styles.columns}>
          <div style={styles.main}>
            <Skeleton height="180px" />
            <Skeleton height="320px" />
          </div>
          <div style={styles.side}>
            <Skeleton height="300px" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !roadmap || !topology) {
    return (
      <div style={styles.errorBox}>
        <span style={styles.errorText}>{t('learning.detail.loadError')}</span>
        <Button onClick={() => fetchDetail({ id: summary.id, language: summary.language, projectId })}>
          {t('learning.detail.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <RoadmapDetailHero summary={summary} description={roadmap.description} />

      <RoadmapStatsStrip
        difficulty={roadmap.difficulty}
        stepCount={steps.length}
        estimatedMinutes={roadmap.estimatedMinutes}
        skills={topology.skills}
      />

      <div style={styles.columns}>
        <div style={styles.main}>
          <ArchitecturePreview topology={topology} />
          <StepOutline steps={steps} passedStepIds={passedStepIds} currentIndex={currentIndex} />
        </div>

        <div style={styles.side}>
          <VerificationPanel roadmap={roadmap} lastRun={lastRun} />
          <PrerequisitesPanel prerequisites={roadmap.prerequisites ?? []} />
          <LaunchFooter
            resume={
              lastRun && currentIndex >= 0
                ? { current: currentIndex + 1, total: steps.length, projectName: lastRun.projectName }
                : undefined
            }
            docker={docker}
            onRecheckDocker={checkDocker}
            onLaunch={onLaunch}
            onRestart={started && projectId ? () => setConfirmRestart(true) : undefined}
            restartError={restartError}
          />
        </div>
      </div>

      {confirmRestart && (
        <ConfirmModal
          title={t('learning.detail.launch.restartTitle')}
          message={t('learning.detail.launch.restartMessage', {
            title: summary.title,
            project: projectName ?? '',
          })}
          confirmText={t('learning.detail.launch.restartConfirm')}
          variant="danger"
          onConfirm={handleRestart}
          onCancel={() => setConfirmRestart(false)}
        />
      )}
    </div>
  );
}

/** Most recent validation across a roadmap's steps, ISO-comparable strings. */
function latestCheck(stepProgress: Record<string, { lastCheckedAt?: string }>): string | undefined {
  let latest: string | undefined;
  for (const entry of Object.values(stepProgress)) {
    if (entry.lastCheckedAt && (!latest || entry.lastCheckedAt > latest)) {
      latest = entry.lastCheckedAt;
    }
  }
  return latest;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
  },
  columns: {
    display: 'flex',
    gap: 'var(--space-5)',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  main: {
    flex: '3 1 420px',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
    minWidth: 0,
  },
  side: {
    flex: '2 1 320px',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
    minWidth: 0,
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-4) var(--space-5)',
    border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)',
    background: 'var(--color-danger-glow)',
    borderRadius: 'var(--radius-md)',
  },
  errorText: {
    flex: 1,
    fontSize: 'var(--text-md)',
    color: 'var(--color-text-primary)',
  },
};
