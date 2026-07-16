import '../../../i18n';
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepHints from './StepHints';
import type { RoadmapStep } from '../../../shared/types/roadmap';

function buildStep(overrides: Partial<RoadmapStep>): RoadmapStep {
  return {
    id: 'run-web-server',
    title: 'Run the web server',
    instruction: 'Serve a page from `web`.',
    validators: [{ type: 'container_running', params: { node: 'web' } }],
    ...overrides,
  };
}

/** Owns revealedCount the way useLearningPlayer does (increment, clamped). */
function Harness({ step, initialRevealed = 0 }: { step: RoadmapStep; initialRevealed?: number }) {
  const [revealed, setRevealed] = useState(initialRevealed);
  const totalRungs = (step.hints?.length ?? 0) + (step.solution ? 1 : 0);
  return (
    <StepHints
      step={step}
      revealedCount={revealed}
      onReveal={() => setRevealed(count => Math.min(count + 1, totalRungs))}
    />
  );
}

describe('StepHints', () => {
  it('reveals hints one at a time, in order, keeping earlier hints readable', () => {
    render(<Harness step={buildStep({ hints: ['First nudge.', 'Second nudge.', 'Almost the answer.'] })} />);

    expect(screen.queryByText('First nudge.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Show hint (1/3)' }));
    expect(screen.getByText('First nudge.')).toBeInTheDocument();
    expect(screen.queryByText('Second nudge.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show hint (2/3)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show hint (3/3)' }));

    expect(screen.getByText('First nudge.')).toBeInTheDocument();
    expect(screen.getByText('Second nudge.')).toBeInTheDocument();
    expect(screen.getByText('Almost the answer.')).toBeInTheDocument();
    // No solution on this step: the ladder ends after the last hint.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('only ever offers the next rung — the solution cannot be reached before all hints', () => {
    render(<Harness step={buildStep({ hints: ['First nudge.', 'Second nudge.'], solution: 'The answer.' })} />);

    expect(screen.getByRole('button', { name: 'Show hint (1/2)' })).toBeInTheDocument();
    expect(screen.queryByText(/Reveal the solution/)).not.toBeInTheDocument();
  });

  it('reveals the solution behind a two-click confirmation, styled as its own rung', () => {
    render(<Harness step={buildStep({ hints: ['Only hint.'], solution: 'The full answer.' })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show hint (1/1)' }));
    expect(screen.getByText('Only hint.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reveal the solution' }));
    // First click arms the button; nothing is revealed yet.
    expect(screen.queryByText('The full answer.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sure? Click again to reveal' }));
    expect(screen.getByText('The full answer.')).toBeInTheDocument();
    expect(screen.getByText('Solution')).toBeInTheDocument();
    expect(screen.getByText('Only hint.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers the solution directly (still with the brake) on a step with no hints', () => {
    render(<Harness step={buildStep({ solution: 'The full answer.' })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reveal the solution' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sure? Click again to reveal' }));
    expect(screen.getByText('The full answer.')).toBeInTheDocument();
  });

  it('renders nothing on a step with neither hints nor solution', () => {
    const { container } = render(<Harness step={buildStep({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows already-revealed hints on arrival when the step is revisited', () => {
    // Coming back to a step: the player hook hands back the persisted count.
    render(
      <StepHints
        step={buildStep({ hints: ['First nudge.', 'Second nudge.'], solution: 'The answer.' })}
        revealedCount={2}
        onReveal={() => {}}
      />
    );

    expect(screen.getByText('First nudge.')).toBeInTheDocument();
    expect(screen.getByText('Second nudge.')).toBeInTheDocument();
    expect(screen.queryByText('The answer.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal the solution' })).toBeInTheDocument();
  });
});
