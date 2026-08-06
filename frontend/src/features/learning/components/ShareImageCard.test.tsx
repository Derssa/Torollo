import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import ShareImageCard from './ShareImageCard';
import type { ShareCardData } from '../shareImageCard';

const DATA: ShareCardData = {
  title: 'Deploy a resilient three-tier app',
  statsLine: '10 of 10 steps passing · 20 of 20 checks passed',
  skills: ['Containers', 'SQL'],
  topologyLabel: 'Topology',
  topology: [{ name: 'web-1', role: 'Load balancer' }],
  footerBrand: 'Torollo — free, MIT, runs locally',
  footerUrl: 'torollo.app',
};

describe('ShareImageCard', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // shouldAdvanceTime lets Testing Library's real-clock `waitFor` polling
    // keep working while we still control the 1500ms revert manually below.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fakeBlob = new Blob(['fake'], { type: 'image/png' });
    HTMLCanvasElement.prototype.toBlob = vi.fn(function toBlob(this: HTMLCanvasElement, callback: BlobCallback) {
      callback(fakeBlob);
    });
    createObjectURL = vi.fn(() => 'blob:fake-url');
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    clickSpy.mockRestore();
  });

  it('renders the preview canvas with a descriptive label', () => {
    render(<ShareImageCard data={DATA} alt="Shareable image card for the roadmap" fileName="torollo-share.png" />);
    expect(screen.getByRole('img', { name: 'Shareable image card for the roadmap' })).toBeInTheDocument();
  });

  it('downloads the rendered PNG under the given file name and confirms briefly', async () => {
    render(<ShareImageCard data={DATA} alt="alt text" fileName="torollo-share.png" />);

    fireEvent.click(screen.getByRole('button', { name: 'Download image' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('torollo-share.png');
    expect(screen.getByRole('button', { name: 'Downloaded' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: 'Download image' })).toBeInTheDocument();
  });
});
