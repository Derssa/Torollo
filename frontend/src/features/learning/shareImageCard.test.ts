import { describe, expect, it, vi } from 'vitest';
import {
  drawShareCard,
  drawShareCardPreview,
  renderShareCardBlob,
  SHARE_CARD_WIDTH,
} from './shareImageCard';
import type { ShareCardData } from './shareImageCard';

const DATA: ShareCardData = {
  title: 'Deploy a resilient three-tier app',
  statsLine: '10 of 10 steps passing · 20 of 20 checks passed',
  skills: ['Containers', 'SQL', 'Networking'],
  topologyLabel: 'Topology',
  topology: [
    { name: 'web-1', role: 'Load balancer' },
    { name: 'db', role: 'PostgreSQL' },
  ],
  footerBrand: 'Torollo — free, MIT, runs locally',
  footerUrl: 'torollo.app',
};

describe('drawShareCard', () => {
  it('resizes the canvas to the fixed social width, height fit to the card', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    drawShareCard(canvas, DATA);
    expect(canvas.width).toBe(SHARE_CARD_WIDTH);
    expect(canvas.height).toBeGreaterThan(0);
  });

  it('does not throw when the canvas cannot produce a 2D context (jsdom default)', () => {
    const canvas = document.createElement('canvas');
    expect(() => drawShareCard(canvas, DATA)).not.toThrow();
  });
});

describe('drawShareCardPreview', () => {
  it('sizes the canvas to the card, not the full social width (jsdom default)', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const size = drawShareCardPreview(canvas, DATA);
    expect(canvas.width).toBe(size.width);
    expect(canvas.height).toBe(size.height);
    expect(canvas.width).toBeLessThan(SHARE_CARD_WIDTH);
  });

  it('does not throw when the canvas cannot produce a 2D context (jsdom default)', () => {
    const canvas = document.createElement('canvas');
    expect(() => drawShareCardPreview(canvas, DATA)).not.toThrow();
  });
});

describe('renderShareCardBlob', () => {
  it('resolves null when the canvas cannot encode (no toBlob support)', async () => {
    const canvas = document.createElement('canvas');
    // jsdom ships a `toBlob` stub that warns and never calls back — force the
    // actually-unsupported shape this branch guards against.
    Object.defineProperty(canvas, 'toBlob', { value: undefined });
    const blob = await renderShareCardBlob(canvas, DATA);
    expect(blob).toBeNull();
  });

  it('exports through toBlob as image/png when available', async () => {
    const canvas = document.createElement('canvas');
    const fakeBlob = new Blob(['fake'], { type: 'image/png' });
    canvas.toBlob = vi.fn((callback: BlobCallback) => callback(fakeBlob));
    const blob = await renderShareCardBlob(canvas, DATA);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(blob).toBe(fakeBlob);
  });
});
