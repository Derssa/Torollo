import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Info, X } from 'lucide-react';
import Modal from '../../../shared/components/Modal';
import Button from '../../../shared/components/Button';
import Skeleton from '../../../shared/components/Skeleton';
import Receipt from '../../../shared/components/Receipt';
import ShareImageCard from './ShareImageCard';
import { deriveTopology } from '../roadmapTopology';
import { filterByUiLanguage } from '../roadmapLanguage';
import { useRoadmaps } from '../hooks/useRoadmaps';
import { useLearningProgressSummaries } from '../hooks/useLearningProgressSummaries';
import type { RunTimes } from '../hooks/useLearningPlayer';
import { renderShareCardBlob, type ShareCardData } from '../shareImageCard';
import type { LearningExit } from '../../../shared/types';
import type { Roadmap, RoadmapSummary } from '../../../shared/types/roadmap';

/** Share-card topology rows beyond this count collapse into a "+N more" line. */
const MAX_SHARE_CARD_TOPOLOGY_ROWS = 6;

interface RoadmapCompletionScreenProps {
  roadmap: Roadmap;
  /** Name of the project the run was validated against, when known. */
  projectName?: string;
  runTimes: RunTimes;
  /** Back to the canvas — the learner's containers keep running. */
  onDismiss: () => void;
  /** Leave the canvas for the home shell: next roadmap's briefing or the catalogue. */
  onExit: (target: LearningExit) => void;
}

/**
 * The celebration at the end of a roadmap, and the only screen built for
 * leaving Torollo: everything on it is something the learner can carry out —
 * a receipt of the real run, a share post to paste as-is, the next roadmap.
 * All facts are read off the roadmap file and the persisted run; the skills
 * come from the same validator derivation as the briefing page.
 */
export default function RoadmapCompletionScreen({
  roadmap,
  projectName,
  runTimes,
  onDismiss,
  onExit,
}: RoadmapCompletionScreenProps) {
  const { t, i18n } = useTranslation();
  const catalogue = useRoadmaps();
  const progress = useLearningProgressSummaries();
  const [shareCopied, setShareCopied] = useState(false);
  const shareResetRef = useRef<number | undefined>(undefined);

  const fetchRoadmaps = catalogue.fetchRoadmaps;
  const fetchProgress = progress.fetchProgress;
  useEffect(() => {
    fetchRoadmaps();
    fetchProgress();
  }, [fetchRoadmaps, fetchProgress]);
  useEffect(() => () => window.clearTimeout(shareResetRef.current), []);

  const topology = useMemo(() => deriveTopology(roadmap), [roadmap]);
  const skills = topology.skills;

  // "Next" follows the catalogue's curated order: the first roadmap the
  // learner hasn't started, then the first they haven't finished. Progress is
  // a garnish — if its fetch failed, every candidate just counts as fresh.
  const nextResolved = !catalogue.loading && !progress.loading;
  const nextRoadmap: RoadmapSummary | undefined = useMemo(() => {
    const candidates = filterByUiLanguage(catalogue.summaries, i18n.language).filter(
      summary => summary.id !== roadmap.id
    );
    return (
      candidates.find(summary => !progress.byRoadmapId[summary.id]) ??
      candidates.find(
        summary => (progress.byRoadmapId[summary.id]?.completedSteps ?? 0) < summary.stepCount
      )
    );
  }, [catalogue.summaries, progress.byRoadmapId, i18n.language, roadmap.id]);

  const formatWhen = (iso: string): string | null => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const total = roadmap.steps.length;
  const startedWhen = runTimes.startedAt ? formatWhen(runTimes.startedAt) : null;
  const finishedWhen = runTimes.finishedAt ? formatWhen(runTimes.finishedAt) : null;
  const receiptLines = [
    t('learning.player.completion.runLineRoadmap', { id: roadmap.id }),
    ...(projectName ? [t('learning.player.completion.runLineProject', { name: projectName })] : []),
    t('learning.player.completion.runLineSteps', { total }),
    ...(startedWhen ? [t('learning.player.completion.runLineStarted', { when: startedWhen })] : []),
    ...(finishedWhen ? [t('learning.player.completion.runLineFinished', { when: finishedWhen })] : []),
  ];

  // The completion screen only ever opens once every step's own validators
  // have passed, so both fractions in the share card are always whole — but
  // reading the real counts (rather than hardcoding "10 of 10") keeps it
  // truthful if that invariant ever changes.
  const shareCardData: ShareCardData = useMemo(() => {
    const checksTotal = roadmap.steps.reduce((sum, step) => sum + step.validators.length, 0);
    const shownNodes = topology.nodes.slice(0, MAX_SHARE_CARD_TOPOLOGY_ROWS);
    const hiddenCount = topology.nodes.length - shownNodes.length;
    return {
      title: roadmap.title,
      statsLine: t('learning.player.completion.shareCardStats', { steps: total, checks: checksTotal }),
      skills: skills.map(skill => t(`learning.detail.skill.${skill}`)),
      topologyLabel: t('learning.player.completion.shareCardTopology'),
      topology: shownNodes.map(node => ({ name: node.name, role: t(`learning.detail.role.${node.role}`) })),
      moreTopologyLabel:
        hiddenCount > 0 ? t('learning.player.completion.shareCardMore', { count: hiddenCount }) : undefined,
      footerBrand: t('learning.player.completion.shareCardFooterBrand'),
      footerUrl: 'torollo.app',
    };
  }, [roadmap, total, topology, skills, t]);

  const confirmShareCopied = () => {
    setShareCopied(true);
    window.clearTimeout(shareResetRef.current);
    shareResetRef.current = window.setTimeout(() => setShareCopied(false), 2000);
  };

  // The post is the share image plus the text, as two representations of one
  // clipboard item: rich composers (X, LinkedIn, Discord…) attach the image,
  // plain text fields take the text — so the torollo.app link survives either
  // way. The image promise must be created synchronously and handed to
  // ClipboardItem unresolved, or Safari drops the write for being outside the
  // user gesture. Browsers without image clipboard support get the text alone.
  const handleCopyShare = async () => {
    const shareText = t('learning.player.completion.shareText', { title: roadmap.title, total });
    try {
      if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard.write === 'function') {
        const image = renderShareCardBlob(document.createElement('canvas'), shareCardData).then(
          blob => blob ?? Promise.reject<Blob>(new Error('image encoding unsupported'))
        );
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': image,
            'text/plain': new Blob([shareText], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(shareText);
      }
      confirmShareCopied();
    } catch {
      // Image write failed or was denied — the text is still worth carrying.
      try {
        await navigator.clipboard.writeText(shareText);
        confirmShareCopied();
      } catch {
        // Clipboard access denied — the button simply stays in its idle state.
      }
    }
  };

  // Column-major like a printed checklist: steps 1..k down the left column,
  // the rest down the right, so the recap reads in roadmap order.
  const recapRows = Math.ceil(total / 2);

  return (
    <Modal onClose={onDismiss} width="608px">
      <div style={styles.screen}>
        <div style={styles.eyebrowRow}>
          <span style={styles.eyebrow}>{t('learning.player.completion.eyebrow')}</span>
          <button
            onClick={onDismiss}
            style={styles.closeBtn}
            aria-label={t('learning.player.dismissNotice')}
          >
            <X size={16} />
          </button>
        </div>

        <div style={styles.titleRow}>
          <h2 style={styles.title}>{roadmap.title}</h2>
          <span style={styles.titleDisc} role="img" aria-label={t('learning.player.completion.eyebrow')}>
            <Check size={13} color="#FFFFFF" strokeWidth={3} />
          </span>
        </div>
        <p style={styles.subtitle}>{t('learning.player.completion.subtitle')}</p>

        <Receipt
          label={t('learning.player.completion.runLabel')}
          lines={receiptLines}
          copyText={receiptLines.join('\n')}
        />

        <div style={styles.section}>
          <span style={styles.sectionLabel}>{t('learning.player.completion.stepsRecap')}</span>
          <div
            style={{
              ...styles.recapGrid,
              gridTemplateRows: `repeat(${recapRows}, auto)`,
            }}
          >
            {roadmap.steps.map((step, index) => (
              <div key={step.id} style={styles.recapItem}>
                <Check size={12} strokeWidth={2.5} color="var(--color-success)" style={styles.recapGlyph} />
                <span style={styles.recapIndex}>{index + 1}.</span>
                <span style={styles.recapTitle}>{step.title}</span>
              </div>
            ))}
          </div>
        </div>

        {skills.length > 0 && (
          <div style={styles.section}>
            <span style={styles.sectionLabel}>{t('learning.player.completion.skills')}</span>
            <div style={styles.skillRow}>
              {skills.map(skill => (
                <span key={skill} style={styles.skillChip}>
                  {t(`learning.detail.skill.${skill}`)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={styles.section}>
          <span style={styles.sectionLabel}>{t('learning.player.completion.shareCardLabel')}</span>
          <ShareImageCard
            data={shareCardData}
            alt={t('learning.player.completion.shareCardAlt', { title: roadmap.title })}
            fileName={`torollo-${roadmap.id}-share.png`}
          />
        </div>

        {nextResolved && !nextRoadmap && (
          <div style={styles.noteBox}>
            <Info size={13} color="var(--color-text-muted)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={styles.noteText}>{t('learning.player.completion.catalogueDone')}</span>
          </div>
        )}

        <div style={styles.footer}>
          <Button variant="primary" onClick={handleCopyShare}>
            {shareCopied
              ? t('learning.player.completion.copiedShare')
              : t('learning.player.completion.copyShare')}
          </Button>
          {nextResolved ? (
            <Button
              onClick={() =>
                nextRoadmap
                  ? onExit({ kind: 'roadmap', summary: nextRoadmap })
                  : onExit({ kind: 'catalog' })
              }
            >
              {nextRoadmap
                ? t('learning.player.completion.nextRoadmap')
                : t('learning.player.completion.allRoadmaps')}
            </Button>
          ) : (
            <Skeleton height="36px" width="132px" />
          )}
          <div style={styles.keepBuilding}>
            <button onClick={onDismiss} style={styles.keepBuildingLink}>
              {t('learning.player.completion.keepBuilding')}
            </button>
            <span style={styles.keepBuildingHint}>
              {t('learning.player.completion.keepBuildingHint')}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  eyebrowRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    color: 'var(--color-text-muted)',
  },
  closeBtn: {
    display: 'flex',
    padding: '4px',
    margin: '-4px -4px 0 0',
    border: 'none',
    background: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  title: {
    margin: 0,
    fontSize: 'var(--text-2xl)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.3px',
    lineHeight: 1.25,
  },
  titleDisc: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-success)',
    flexShrink: 0,
  },
  subtitle: {
    margin: 'calc(-1 * var(--space-2)) 0 0',
    fontSize: 'var(--text-md)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  sectionLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-muted)',
  },
  recapGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridAutoFlow: 'column',
    columnGap: 'var(--space-5)',
    rowGap: 'var(--space-1)',
  },
  recapItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--space-2)',
    minWidth: 0,
  },
  recapGlyph: {
    alignSelf: 'center',
    flexShrink: 0,
  },
  recapIndex: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-muted)',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },
  recapTitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-primary)',
    lineHeight: 1.6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  skillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-1)',
  },
  skillChip: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px var(--space-2)',
  },
  noteBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
  },
  noteText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-2)',
  },
  keepBuilding: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
    marginLeft: 'auto',
    minWidth: 0,
  },
  keepBuildingLink: {
    padding: 0,
    border: 'none',
    background: 'none',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--color-accent)',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  keepBuildingHint: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-muted)',
  },
};
