import '../../../../../i18n';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RoadmapDetailPage from './RoadmapDetailPage';
import type { ProgressEntrySummary, RoadmapSummary } from '../../../../../shared/types/roadmap';

const summary: RoadmapSummary = {
  id: 'cache-aside-redis',
  title: 'Cache-aside with Redis',
  description: 'Add a Redis cache-aside layer.',
  language: 'en',
  difficulty: 'intermediate',
  estimatedMinutes: 30,
  stepCount: 3,
};

const roadmap = {
  schemaVersion: 1,
  id: 'cache-aside-redis',
  title: 'Cache-aside with Redis',
  description: 'Feel a slow store on real containers, then fix it.',
  language: 'en',
  difficulty: 'intermediate',
  estimatedMinutes: 30,
  prerequisites: ['Docker installed and running'],
  steps: [
    {
      id: 'reopen-the-store',
      title: 'Reopen the store',
      instruction: 'Start the web node.',
      validators: [{ type: 'container_running', params: { node: 'web' } }],
    },
    {
      id: 'the-catalog',
      title: 'The catalog',
      instruction: 'Create the books table.',
      validators: [{ type: 'table_exists', params: { node: 'db', table: 'books' } }],
    },
    {
      id: 'add-the-cache',
      title: 'Enter Redis',
      instruction: 'Add a Redis node.',
      validators: [
        { type: 'redis_key_exists', params: { node: 'cache', key: 'cache:books' } },
        { type: 'port_denied', params: { source: 'cache', target: 'db', port: 5432 } },
      ],
    },
  ],
};

const progress: ProgressEntrySummary = {
  projectId: 'p1',
  roadmapId: 'cache-aside-redis',
  updatedAt: '2026-07-20T10:00:00.000Z',
  completedSteps: 1,
};

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

/** The page fetches the roadmap, its step progress and Docker health in parallel. */
function buildFetchMock(handlers: {
  roadmap?: () => Promise<Response> | Response;
  stepProgress?: () => Response;
  docker?: () => Response;
  deleteProgress?: () => Response;
} = {}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/health')) {
      return Promise.resolve(
        handlers.docker?.() ?? jsonResponse(true, { status: 'ok', checks: { docker: { status: 'ok' } } })
      );
    }
    if (url.includes('/api/learning/roadmaps/')) {
      return Promise.resolve(handlers.roadmap?.() ?? jsonResponse(true, roadmap));
    }
    if (url.includes('/api/learning/progress/')) {
      if (init?.method === 'DELETE') {
        return Promise.resolve(handlers.deleteProgress?.() ?? jsonResponse(true, {}));
      }
      return Promise.resolve(
        handlers.stepProgress?.() ??
          jsonResponse(true, {
            steps: {
              'reopen-the-store': {
                passed: true,
                attempts: 2,
                revealedHints: 0,
                lastCheckedAt: '2026-07-20T10:00:00.000Z',
              },
            },
          })
      );
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

function renderPage(props: Partial<React.ComponentProps<typeof RoadmapDetailPage>> = {}) {
  const onLaunch = vi.fn();
  const onProgressCleared = vi.fn();
  render(
    <RoadmapDetailPage
      summary={summary}
      onLaunch={onLaunch}
      onProgressCleared={onProgressCleared}
      {...props}
    />
  );
  return { onLaunch, onProgressCleared };
}

describe('RoadmapDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a skeleton while the roadmap loads', () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock({ roadmap: () => new Promise<Response>(() => {}) })
    );
    renderPage();

    const section = screen.getByLabelText('Loading roadmap');
    expect(section.getAttribute('aria-busy')).toBe('true');
    expect(section.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows a visible error block whose Retry refetches the roadmap', async () => {
    let attempts = 0;
    const fetchMock = buildFetchMock({
      roadmap: () => {
        attempts += 1;
        return attempts === 1 ? Promise.reject(new Error('network down')) : jsonResponse(true, roadmap);
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderPage();

    expect(await screen.findByText('Could not load this roadmap. Is the backend running?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Reopen the store')).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it('describes the roadmap from its own file and validators', async () => {
    vi.stubGlobal('fetch', buildFetchMock());
    renderPage();

    // Description, steps and prerequisites come from the roadmap file.
    expect(await screen.findByText('Feel a slow store on real containers, then fix it.')).toBeInTheDocument();
    expect(screen.getByText('Enter Redis')).toBeInTheDocument();
    expect(screen.getByText('Docker installed and running')).toBeInTheDocument();

    // Topology is read off the validators: roles, and the link the roadmap
    // requires blocked.
    const build = screen.getByRole('heading', { name: "What you'll build" }).closest('section') as HTMLElement;
    expect(within(build).getByText('cache')).toBeInTheDocument();
    expect(within(build).getByText('PostgreSQL')).toBeInTheDocument();
    expect(within(build).getByText('Redis')).toBeInTheDocument();
    expect(within(build).getByText('cache → db')).toBeInTheDocument();
    expect(within(build).getByText('must be blocked')).toBeInTheDocument();
    // ...and so are the skills.
    expect(screen.getByText('Security groups')).toBeInTheDocument();

    // Never played: the receipt is a labelled sample of the real checks.
    expect(screen.getByText('Sample validation receipt')).toBeInTheDocument();
    expect(screen.getByText('check: container "web" is running')).toBeInTheDocument();
  });

  it('launches a fresh roadmap', async () => {
    vi.stubGlobal('fetch', buildFetchMock());
    const { onLaunch } = renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Launch lab/ }));
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it('resumes a started roadmap and shows its real last run', async () => {
    vi.stubGlobal('fetch', buildFetchMock());
    const { onLaunch } = renderPage({ progress, projectName: 'Lab one' });

    const resume = await screen.findByRole('button', { name: /Continue · step 2 of 3/ });
    expect(screen.getByText('You are here')).toBeInTheDocument();
    expect(screen.getByText('Your last run · Lab one')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 steps passing')).toBeInTheDocument();
    expect(screen.getByText('next: "The catalog"')).toBeInTheDocument();

    fireEvent.click(resume);
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it('clears the progress after the restart is confirmed', async () => {
    const fetchMock = buildFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const { onProgressCleared } = renderPage({ progress, projectName: 'Lab one' });

    fireEvent.click(await screen.findByRole('button', { name: /Restart roadmap/ }));
    // The footer trigger and the modal's confirm share a label, by design —
    // an action keeps its name through the flow.
    const modalTitle = await screen.findByRole('heading', { name: 'Restart roadmap' });
    const modal = modalTitle.parentElement as HTMLElement;
    fireEvent.click(within(modal).getByRole('button', { name: 'Restart roadmap' }));

    await waitFor(() => expect(onProgressCleared).toHaveBeenCalledTimes(1));
    const deleteCall = fetchMock.mock.calls.find(call => call[1]?.method === 'DELETE');
    expect(String(deleteCall?.[0])).toContain('/api/learning/progress/p1/cache-aside-redis');
  });

  it('warns before launching when Docker is not running', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock({
        docker: () => jsonResponse(false, { status: 'degraded', checks: { docker: { status: 'unreachable' } } }),
      })
    );
    renderPage();

    expect(
      await screen.findByText("Docker isn't running — start Docker to launch containers.")
    ).toBeInTheDocument();
    // The probe informs, it never blocks the launch.
    expect(screen.getByRole('button', { name: /Launch lab/ })).not.toBeDisabled();
  });
});
