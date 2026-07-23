import '../../i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Receipt from './Receipt';

describe('Receipt', () => {
  it('renders every line and the label eyebrow', () => {
    render(
      <Receipt
        label="Sample validation receipt"
        lines={['checked: redis-cli GET session:demo', '→ "ok"']}
      />
    );

    expect(screen.getByText('Sample validation receipt')).toBeTruthy();
    expect(screen.getByText('checked: redis-cli GET session:demo')).toBeTruthy();
    expect(screen.getByText('→ "ok"')).toBeTruthy();
  });

  it('shows no copy button without copyText', () => {
    render(<Receipt lines={['checked: something']} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('copies the given text to the clipboard and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<Receipt lines={['checked: something']} copyText="checked: something" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('checked: something');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    });
  });
});
