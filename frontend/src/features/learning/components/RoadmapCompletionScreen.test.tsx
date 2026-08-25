import '../../../i18n';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RoadmapCompletionScreen from './RoadmapCompletionScreen';
import type { Roadmap, RoadmapSummary } from '../../../shared/types/roadmap';

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

const roadmap: Roadmap = {
  schemaVersion: 1,
  id: 'example-first-architecture',
  title: 'Your first architecture',
  description: 'Build a minimal two-tier architecture.',
  language: 'en',
  steps: [
    {
      id: 'create-web-server',
      title: 'Create the web server',
      instruction: 'Drag an Ubuntu node named `web` onto the canvas.',
      validators: [{ type: 'container_running', params: { node: 'web' } }],
    },
    {
      id: 'add-database',
      title: 'Add the database',
      instruction: 'Add a Postgres node named `db`.',
      validators: [{ type: 'table_exists', params: { node: 'db', table: 'invoices' } }],
    },
  ],
};

const currentSummary: RoadmapSummary = {
  id: roadmap.id,
  title: roadmap.title,
  description: roadmap.description,
  language: 'en',
  stepCount: 2,
};

const otherSummary: RoadmapSummary = {
  id: 'resilient-three-tier',
  title: 'Deploy a resilient three-tier app',
  description: 'LB, app fleet, database.',
  language: 'en',
  stepCount: 10,
};

describe('RoadmapCompletionScreen', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;

  function mockApi({
    summaries = [currentSummary, otherSummary],
    entries = [] as unknown[],
  } = {}) {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/learning/progress')) {
        return Promise.resolve(jsonResponse(true, { entries }));
      }
      if (url.includes('/api/learning/roadmaps')) {
        return Promise.resolve(jsonResponse(true, summaries));
      }
      return Promise.resolve(jsonResponse(true, {}));
    });
  }

  function renderScreen({ onDismiss = vi.fn(), onExit = vi.fn() } = {}) {
    render(
      <RoadmapCompletionScreen
        roadmap={roadmap}
        projectName="My first lab"
        runTimes={{ startedAt: '2026-07-15T09:00:00.000Z', finishedAt: '2026-07-15T09:45:00.000Z' }}
        onDismiss={onDismiss}
        onExit={onExit}
      />
    );
    return { onDismiss, onExit };
  }

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the celebration: title, run receipt, steps recap and derived skills', async () => {
    mockApi();
    renderScreen();

    expect(screen.getByText('Your first architecture')).toBeInTheDocument();
    expect(
      screen.getByText('Every step passed against your running containers.')
    ).toBeInTheDocument();

    // The receipt states the real run, not a paraphrase.
    expect(screen.getByText('roadmap: example-first-architecture')).toBeInTheDocument();
    expect(screen.getByText('project: My first lab')).toBeInTheDocument();
    expect(screen.getByText('steps: 2/2 passed')).toBeInTheDocument();
    expect(screen.getByText(/^started: /)).toBeInTheDocument();
    expect(screen.getByText(/^finished: /)).toBeInTheDocument();

    // Every step, with its position — the recap is the roadmap's own outline.
    expect(screen.getByText('Create the web server')).toBeInTheDocument();
    expect(screen.getByText('Add the database')).toBeInTheDocument();

    // Skills come off the validators (container_running → Containers, table_exists → SQL).
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('SQL')).toBeInTheDocument();

    expect(await screen.findByText('Next roadmap')).toBeInTheDocument();

    // The share card: same facts as the receipt/recap, rendered onto a canvas.
    expect(screen.getByText('Share image')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Shareable image card for “Your first architecture”' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download image' })).toBeInTheDocument();
  });

  it('copies a share post as plain text when the browser cannot copy images (jsdom default)', async () => {
    mockApi();
    renderScreen();

    fireEvent.click(screen.getByText('Copy share post'));

    expect(writeText).toHaveBeenCalledWith(
      'I just completed “Your first architecture” on Torollo — 2/2 steps verified against real Docker containers running on my machine. Free and open source: torollo.app'
    );
    expect(await screen.findByText('Copied — paste it anywhere')).toBeInTheDocument();
  });

  it('copies the share image and the text as one clipboard item when supported', async () => {
    mockApi();
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { write, writeText },
      configurable: true,
    });
    class FakeClipboardItem {
      items: Record<string, unknown>;
      constructor(items: Record<string, unknown>) {
        this.items = items;
      }
    }
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function toBlob(callback: BlobCallback) {
      callback(new Blob(['png'], { type: 'image/png' }));
    });

    try {
      renderScreen();
      fireEvent.click(screen.getByText('Copy share post'));

      expect(await screen.findByText('Copied — paste it anywhere')).toBeInTheDocument();
      expect(write).toHaveBeenCalledTimes(1);
      const item = write.mock.calls[0][0][0] as FakeClipboardItem;
      expect(Object.keys(item.items)).toEqual(['image/png', 'text/plain']);
      expect(writeText).not.toHaveBeenCalled();
    } finally {
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    }
  });

  it('routes "Next roadmap" to the first unstarted roadmap of the catalogue', async () => {
    mockApi();
    const { onExit } = renderScreen();

    fireEvent.click(await screen.findByText('Next roadmap'));

    expect(onExit).toHaveBeenCalledWith({ kind: 'roadmap', summary: otherSummary });
  });

  it('skips roadmaps already finished and prefers an unstarted one', async () => {
    const third: RoadmapSummary = { ...otherSummary, id: 'redis-queue-workers', title: 'Queue it' };
    mockApi({
      summaries: [currentSummary, otherSummary, third],
      entries: [
        // otherSummary is finished (10/10) — the next win is the untouched one.
        { projectId: 'p1', roadmapId: otherSummary.id, updatedAt: '2026-07-15T09:00:00.000Z', completedSteps: 10 },
      ],
    });
    const { onExit } = renderScreen();

    fireEvent.click(await screen.findByText('Next roadmap'));

    expect(onExit).toHaveBeenCalledWith({ kind: 'roadmap', summary: third });
  });

  it('falls back to the catalogue with a note when every roadmap is done', async () => {
    mockApi({ summaries: [currentSummary] });
    const { onExit } = renderScreen();

    expect(
      await screen.findByText(/That's every roadmap in the catalogue for now/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('All roadmaps'));
    expect(onExit).toHaveBeenCalledWith({ kind: 'catalog' });
  });

  it('returns to the canvas through the keep-building link', async () => {
    mockApi();
    const { onDismiss } = renderScreen();

    fireEvent.click(screen.getByText('Keep building'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
