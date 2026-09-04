import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
 * - Once the step has passed (`passed`), the ladder is over: the solution
 *   is shown on its own, marked as the step's debrief, with no reveal
 *   control. Roadmap authors write solutions explanation-first for this
 *   reason. Hints already revealed stay readable; unrevealed ones stay
 *   hidden (they are troubleshooting notes for a step that is done).
 *
 * Visually the ladder is marginalia, not a stack of alert cards: one hairline
 * rule bounds the whole column, each rung carries a lowercase mono marker
 * (`hint 1/3`, `solution`, `debrief`), and the reveal control is the last
 * line of the same column. No icons, no fills — only the solution marker
 * takes color.
 */

interface StepHintsProps {
  step: RoadmapStep;
  revealedCount: number;
  onReveal: () => void;
  /** The step's checks have passed: show the solution as the debrief. */
  passed?: boolean;
}

export default function StepHints({ step, revealedCount, onReveal, passed = false }: StepHintsProps) {
  const { t } = useTranslation();
  const [solutionArmed, setSolutionArmed] = useState(false);

  const hints = step.hints ?? [];
  const hasSolution = Boolean(step.solution);
  const totalRungs = hints.length + (hasSolution ? 1 : 0);
  if (totalRungs === 0) return null;

  const revealed = Math.min(revealedCount, totalRungs);
  const solutionRevealed = hasSolution && revealed === totalRungs;
  const debrief = passed && hasSolution && !solutionRevealed;
  const nextIsSolution = !solutionRevealed && revealed === hints.length;
  const ladderOpen = !passed && revealed < totalRungs;

  const handleReveal = () => {
    if (nextIsSolution && !solutionArmed) {
      setSolutionArmed(true);
      return;
    }
    setSolutionArmed(false);
    onReveal();
  };

  return (
    // The rule marks revealed marginalia; before the first reveal the lone
    // button stands unruled.
    <div style={{ ...styles.container, ...(revealed > 0 || debrief ? styles.containerRuled : {}) }}>
      {hints.slice(0, Math.min(revealed, hints.length)).map((hint, index) => (
        <div key={index} style={styles.rung}>
          <span style={styles.marker}>
            {t('learning.player.hintLabel', { n: index + 1, total: hints.length })}
          </span>
          {renderInstruction(hint)}
        </div>
      ))}

      {(solutionRevealed || debrief) && (
        <div style={styles.rung}>
          <span style={{ ...styles.marker, ...styles.solutionMarker }}>
            {t(debrief ? 'learning.player.debriefLabel' : 'learning.player.solutionLabel')}
          </span>
          {renderInstruction(step.solution!)}
        </div>
      )}

      {ladderOpen && (
        <button
          onClick={handleReveal}
          style={{ ...styles.revealBtn, ...(nextIsSolution ? styles.revealSolutionBtn : {}) }}
        >
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
    gap: '12px',
    marginTop: '12px',
  },
  containerRuled: {
    paddingLeft: '10px',
    borderLeft: '2px solid var(--border-color)',
  },
  rung: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  marker: {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--color-text-muted)',
  },
  solutionMarker: {
    color: 'var(--color-warning-strong)',
  },
  revealBtn: {
    alignSelf: 'flex-start',
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: '3px',
  },
  revealSolutionBtn: {
    color: 'var(--color-warning-strong)',
  },
};
