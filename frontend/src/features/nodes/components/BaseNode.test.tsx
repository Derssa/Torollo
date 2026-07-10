import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Cpu } from 'lucide-react';
import BaseNode from './BaseNode';

function renderBaseNode(props: Partial<Parameters<typeof BaseNode>[0]> = {}) {
  return render(
    <BaseNode
      id="c1"
      name="web-1"
      isRunning={false}
      icon={<Cpu size={18} />}
      hideHandles={true} // Handles need a React Flow context, irrelevant here
      onStart={vi.fn()}
      onStop={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />
  );
}

describe('BaseNode', () => {
  it('shows Offline when stopped without an error', () => {
    renderBaseNode();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows the Error status and the failure reason when the node has an error', () => {
    renderBaseNode({ errorMessage: 'A port this container needs is already taken on your machine.' });
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('A port this container needs is already taken on your machine.')).toBeInTheDocument();
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });

  it('still offers the Start button in the error state so the user can retry', () => {
    renderBaseNode({ errorMessage: 'port taken' });
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('ignores a stale error once the node is running', () => {
    renderBaseNode({ isRunning: true, errorMessage: 'port taken' });
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
    expect(screen.queryByText('port taken')).not.toBeInTheDocument();
  });
});
