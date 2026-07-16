import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, KeyRound } from 'lucide-react';
import { renderInstruction } from './InstructionMarkdown';
import type { RoadmapStep } from '../../../shared/types/roadmap';

/**
 * Progressive hint ladder of one step: [...hints, solution?], where
 * `revealedCount` (owned by useLearningPlayer, keyed by step id) is how many
 * rungs are visible. Design decisions, in place of a written spec:
 *
 * - Strictly sequential: one button reveals the next rung; there is no way
 *   to jump ahead. Revealed rungs stay readable — including when the learner
 *   navigates away and back — for the whole session.
 * - Hints are free: no validation attempt is required first (a learner stuck
 *   before even trying needs the first nudge most).
 * - The solution is the last rung, behind a light brake: the first click
 *   arms the button (label switches to a confirmation), the second reveals.
 *   The armed state is local and resets on step change (`key={step.id}` at
 *   the call site) — no modal.
 * - A step with neither hints nor solution renders nothing.
 */

interface StepHintsProps {
  step: RoadmapStep;
  revealedCount: number;
  onReveal: () => void;
}

export default function StepHints({ step, revealedCount, onReveal }: StepHintsProps) {
  const { t } = useTranslation();
  const [solutionArmed, setSolutionArmed] = useState(false);

  const hints = step.hints ?? [];
  const hasSolution = Boolean(step.solution);
  const totalRungs = hints.length + (hasSolution ? 1 : 0);
  if (totalRungs === 0) return null;

  const revealed = Math.min(revealedCount, totalRungs);
  const solutionRevealed = hasSolution && revealed === totalRungs;
  const nextIsSolution = !solutionRevealed && revealed === hints.length;

  const handleReveal = () => {
    if (nextIsSolution && !solutionArmed) {
      setSolutionArmed(true);
      return;
    }
    setSolutionArmed(false);
    onReveal();
  };

  return (
    <div style={styles.container}>
      {hints.slice(0, revealed).map((hint, index) => (
        <div key={index} style={styles.hintBox}>
          <span style={styles.hintLabel}>
            <Lightbulb size={12} style={styles.labelIcon} />
            {t('learning.player.hintLabel', { n: index + 1, total: hints.length })}
          </span>
          {renderInstruction(hint)}
        </div>
      ))}

      {solutionRevealed && (
        <div style={{ ...styles.hintBox, ...styles.solutionBox }}>
          <span style={{ ...styles.hintLabel, ...styles.solutionLabel }}>
            <KeyRound size={12} style={styles.labelIcon} />
            {t('learning.player.solutionLabel')}
          </span>
          {renderInstruction(step.solution!)}
        </div>
      )}

      {revealed < totalRungs && (
        <button
          onClick={handleReveal}
          style={{ ...styles.revealBtn, ...(nextIsSolution ? styles.revealSolutionBtn : {}) }}
        >
          {nextIsSolution ? (
            <KeyRound size={13} style={styles.labelIcon} />
          ) : (
            <Lightbulb size={13} style={styles.labelIcon} />
          )}
          {nextIsSolution
            ? solutionArmed
              ? t('learning.player.confirmSolution')
              : t('learning.player.showSolution')
            : t('learning.player.showHint', { n: revealed + 1, total: hints.length })}
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '10px',
  },
  hintBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 10px',
    border: '1px solid var(--border-color)',
    borderLeft: '3px solid var(--color-accent)',
    borderRadius: '6px',
  },
  solutionBox: {
    borderColor: 'var(--color-warning)',
    borderLeft: '3px solid var(--color-warning)',
    backgroundColor: 'var(--color-warning-glow)',
  },
  hintLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  solutionLabel: {
    color: 'var(--color-warning-strong)',
  },
  labelIcon: {
    marginRight: '5px',
    flexShrink: 0,
  },
  revealBtn: {
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    padding: '6px 12px',
    border: '1px dashed var(--border-color)',
    borderRadius: '6px',
    background: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  revealSolutionBtn: {
    border: '1px dashed var(--color-warning)',
    color: 'var(--color-warning-strong)',
  },
};
