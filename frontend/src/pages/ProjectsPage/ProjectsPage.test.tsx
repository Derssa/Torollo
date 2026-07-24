import '../../i18n';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ProjectsPage from './ProjectsPage';
import type { Project } from '../../shared/types';
import type { ProgressEntrySummary, RoadmapSummary } from '../../shared/types/roadmap';

const projects: Project[] = [
  { id: 'p1', name: 'Lab one', createdAt: '2026-07-01T10:00:00.000Z' },
  { id: 'p2', name: 'Lab two', createdAt: '2026-07-02T10:00:00.000Z' },
];

const summaries: RoadmapSummary[] = [
  {
    id: 'resilient-three-tier',
    title: 'Deploy a resilient three-tier app',
    description: 'Build a three-tier architecture.',
    language: 'en',
    difficulty: 'intermediate',
    estimatedMinutes: 40,
    stepCount: 10,
  },
  {
    id: 'cache-aside-redis',
    title: 'Cache-aside with Redis',
    description: 'Add a Redis cache-aside layer.',
    language: 'en',
    difficulty: 'intermediate',
    estimatedMinutes: 30,
    stepCount: 8,
  },
  {
    id: 'cache-aside-redis',
    title: 'Cache-aside avec Redis',
    description: 'Ajoutez une couche de cache Redis.',
    language: 'fr',
    difficulty: 'intermediate',
    estimatedMinutes: 30,
    stepCount: 8,
  },
];

const progressEntries: ProgressEntrySummary[] = [
  { projectId: 'p1', roadmapId: 'cache-aside-redis', updatedAt: '2026-07-20T10:00:00.000Z', completedSteps: 3 },
];

/** What GET /api/learning/roadmaps/:id returns for the briefing page. */
const cacheAsideRoadmap = {
  schemaVersion: 1,
  id: 'cache-aside-redis',
  title: 'Cache-aside with Redis',
  description: 'Add a Redis cache-aside layer.',
  language: 'en',
  difficulty: 'intermediate',
  estimatedMinutes: 30,
  steps: [
    {
      id: 'reopen-the-store',
      title: 'Reopen the store',
      instruction: 'Start the web node.',
      validators: [{ type: 'container_running', params: { node: 'web' } }],
    },
    {
      id: 'add-the-cache',
      title: 'Enter Redis',
      instruction: 'Add a Redis node.',
      validators: [{ type: 'redis_key_exists', params: { node: 'cache', key: 'cache:books' } }],
    },
  ],
};

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

/**
 * The page fires parallel fetches on mount (projects, roadmaps, progress) —
 * route by URL, never by call order.
 */
function buildFetchMock(handlers: {
  projects?: () => Promise<Response> | Response;
  createProject?: (body: unknown) => Response;
  roadmaps?: () => Response;
  roadmapDetail?: () => Response;
  progress?: () => Response;
  stepProgress?: () => Response;
} = {}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/health')) {
      return Promise.resolve(jsonResponse(true, { status: 'ok', checks: { docker: { status: 'ok' } } }));
    }
    // One roadmap (briefing page) before the catalogue — both share a prefix.
    if (url.includes('/api/learning/roadmaps/')) {
      return Promise.resolve(handlers.roadmapDetail?.() ?? jsonResponse(true, cacheAsideRoadmap));
    }
    if (url.includes('/api/learning/roadmaps')) {
      return Promise.resolve(handlers.roadmaps?.() ?? jsonResponse(true, summaries));
    }
    if (url.includes('/api/learning/progress/')) {
      return Promise.resolve(
        handlers.stepProgress?.() ??
          jsonResponse(true, { steps: { 'reopen-the-store': { passed: true, attempts: 1, revealedHints: 0 } } })
      );
    }
    if (url.includes('/api/learning/progress')) {
      return Promise.resolve(handlers.progress?.() ?? jsonResponse(true, { entries: progressEntries }));
    }
    if (url.includes('/api/projects')) {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return Promise.resolve(
          handlers.createProject?.(body) ??
            jsonResponse(true, { id: 'new1', name: body.name, createdAt: '2026-07-22T10:00:00.000Z' })
        );
      }
      return Promise.resolve(handlers.projects?.() ?? jsonResponse(true, { projects }));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

/** The learning view lives behind the side rail's Learning item. */
function goToLearning() {
  fireEvent.click(screen.getByRole('button', { name: 'Learning' }));
}

/** A roadmap card opens the briefing page; launching happens from there. */
async function openBriefing(title: string) {
  fireEvent.click(await screen.findByText(title));
  return screen.findByRole('button', { name: /Launch lab|Continue · step/ });
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows skeleton cards while projects are loading', async () => {
    // A projects request that never settles keeps the section in its loading state.
    vi.stubGlobal('fetch', buildFetchMock({ projects: () => new Promise<Response>(() => {}) }));
    render(<ProjectsPage onSelectProject={vi.fn()} />);

    const section = screen.getByLabelText('Loading projects');
    expect(section.getAttribute('aria-busy')).toBe('true');
    expect(section.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows a visible error block whose Retry refetches the projects', async () => {
    let failures = 0;
    const fetchMock = buildFetchMock({
      projects: () => {
        failures += 1;
        return failures === 1
          ? Promise.reject(new Error('network down'))
          : jsonResponse(true, { projects });
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ProjectsPage onSelectProject={vi.fn()} />);

    expect(await screen.findByText('Could not load projects. Is the backend running?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Lab one')).toBeInTheDocument();

    errorSpy.mockRestore();
  });

  it('renders project cards as buttons with a locale-formatted date', async () => {
    vi.stubGlobal('fetch', buildFetchMock());
    const onSelectProject = vi.fn();
    render(<ProjectsPage onSelectProject={onSelectProject} />);

    const card = await screen.findByRole('button', { name: /Lab one/ });
    expect(card.tagName).toBe('BUTTON');
    expect(screen.getByText('Jul 1, 2026')).toBeInTheDocument();

    fireEvent.click(card);
    expect(onSelectProject).toHaveBeenCalledWith('p1', 'Lab one');
  });

  it('opens on the projects view and switches to learning through the side rail', async () => {
    vi.stubGlobal('fetch', buildFetchMock());
    render(<ProjectsPage onSelectProject={vi.fn()} />);

    expect(await screen.findByText('Lab one')).toBeInTheDocument();
    expect(screen.queryByText('Learn system design by running real infrastructure.')).toBeNull();

    goToLearning();

    expect(await screen.findByText('Learn system design by running real infrastructure.')).toBeInTheDocument();
    expect(screen.queryByText('Lab one')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    expect(await screen.findByText('Lab one')).toBeInTheDocument();
  });

  it('sends the first-run hero "Start learning" to the learning view', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ projects: () => jsonResponse(true, { projects: [] }) }));
    render(<ProjectsPage onSelectProject={vi.fn()} />);

    expect(await screen.findByText('Build real infrastructure on your machine.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start learning' }));

    expect(await screen.findByText('Learn system design by running real infrastructure.')).toBeInTheDocument();
  });

  it('lists roadmaps of the UI language only, started ones first with a continue label', async () => {
    vi.stubGlobal('fetch', buildFetchMock());
    render(<ProjectsPage onSelectProject={vi.fn()} />);
    goToLearning();

    const started = await screen.findByText('Cache-aside with Redis');
    expect(screen.queryByText('Cache-aside avec Redis')).toBeNull();
    expect(screen.getByText('Continue · step 4 of 8')).toBeInTheDocument();

    const other = screen.getByText('Deploy a resilient three-tier app');
    // Started roadmap sorts before the untouched one.
    expect(
      started.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('opens the briefing page from a roadmap card, with a breadcrumb back to the catalogue', async () => {
    vi.stubGlobal('fetch', buildFetchMock());
    render(<ProjectsPage onSelectProject={vi.fn()} />);
    goToLearning();

    await openBriefing('Cache-aside with Redis');
    // Real content of the roadmap file, not the catalogue summary.
    expect(screen.getByText('Reopen the store')).toBeInTheDocument();
    expect(screen.getByText('Enter Redis')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Roadmaps' }));
    expect(await screen.findByText('Learn system design by running real infrastructure.')).toBeInTheDocument();
  });

  it('deep-links a started roadmap straight into the project it was played in', async () => {
    vi.stubGlobal('fetch', buildFetchMock());
    const onSelectProject = vi.fn();
    render(<ProjectsPage onSelectProject={onSelectProject} />);
    goToLearning();

    fireEvent.click(await openBriefing('Cache-aside with Redis'));

    expect(onSelectProject).toHaveBeenCalledWith('p1', 'Lab one', {
      roadmap: { id: 'cache-aside-redis', language: 'en' },
    });
  });

  it('asks which project to use for an unstarted roadmap when several exist', async () => {
    vi.stubGlobal('fetch', buildFetchMock());
    const onSelectProject = vi.fn();
    render(<ProjectsPage onSelectProject={onSelectProject} />);
    goToLearning();

    fireEvent.click(await openBriefing('Deploy a resilient three-tier app'));

    const modalTitle = await screen.findByText('Choose a project');
    const modalPanel = modalTitle.parentElement as HTMLElement;
    fireEvent.click(within(modalPanel).getByRole('button', { name: /Lab two/ }));

    expect(onSelectProject).toHaveBeenCalledWith('p2', 'Lab two', {
      roadmap: { id: 'resilient-three-tier', language: 'en' },
    });
  });

  it('creates "My first lab" when a roadmap is started with zero projects', async () => {
    const fetchMock = buildFetchMock({
      projects: () => jsonResponse(true, { projects: [] }),
      progress: () => jsonResponse(true, { entries: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSelectProject = vi.fn();
    render(<ProjectsPage onSelectProject={onSelectProject} />);
    goToLearning();

    fireEvent.click(await openBriefing('Cache-aside with Redis'));

    await waitFor(() => {
      expect(onSelectProject).toHaveBeenCalledWith('new1', 'My first lab', {
        roadmap: { id: 'cache-aside-redis', language: 'en' },
      });
    });
    const createCall = fetchMock.mock.calls.find(call => call[1]?.method === 'POST');
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({ name: 'My first lab' });
  });
});
