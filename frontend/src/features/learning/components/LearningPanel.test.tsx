import '../../../i18n';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LearningPanel from './LearningPanel';
import type {
  Roadmap,
  RoadmapProgressResponse,
  RoadmapSummary,
  StepValidationResponse,
} from '../../../shared/types/roadmap';

const summaries: RoadmapSummary[] = [
  {
    id: 'example-first-architecture',
    title: 'Your first architecture',
    description: 'Build a minimal two-tier architecture.',
    language: 'en',
    difficulty: 'beginner',
    estimatedMinutes: 30,
    stepCount: 2,
  },
];

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
      instruction: 'Drag an Ubuntu node named `web` onto the canvas and start it.',
      validators: [{ type: 'container_running', params: { node: 'web' } }],
    },
    {
      id: 'add-database',
      title: 'Add the database',
      instruction: 'Add a Postgres node named `db`.',
      validators: [{ type: 'container_running', params: { node: 'db' } }],
    },
  ],
};

const failResponse: StepValidationResponse = {
  roadmapId: roadmap.id,
  stepId: 'create-web-server',
  stepPassed: false,
  results: [
    {
      index: 0,
      type: 'container_running',
      status: 'fail',
      message: 'No container named "web" exists in this project yet.',
      expected: 'a running container named "web"',
      observed: 'no container with that name',
    },
  ],
  checkedAt: '2026-07-15T10:00:00.000Z',
};

const passResponse: StepValidationResponse = {
  roadmapId: roadmap.id,
  stepId: 'create-web-server',
  stepPassed: true,
  results: [
    {
      index: 0,
      type: 'container_running',
      status: 'pass',
      message: 'The container "web" is running.',
    },
  ],
  checkedAt: '2026-07-15T10:01:00.000Z',
};

const emptyProgress: RoadmapProgressResponse = {
  projectId: 'p1',
  roadmapId: roadmap.id,
  steps: {},
};

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

/** Routes fetch calls by URL so the catalogue, roadmap, validate and progress endpoints can be scripted independently. */
function buildFetchMock(handlers: {
  roadmaps?: () => Response;
  roadmap?: () => Response;
  validate?: () => Response;
  progress?: () => Response;
  hints?: () => Response;
  reset?: () => Response;
}) {
  return vi.fn((url: string, options?: RequestInit) => {
    if (url.includes('/api/learning/validate')) {
      return Promise.resolve(handlers.validate?.() ?? jsonResponse(true, failResponse));
    }
    if (url.includes('/api/learning/progress/') && url.endsWith('/hints')) {
      return Promise.resolve(handlers.hints?.() ?? jsonResponse(true, {}));
    }
    if (url.includes('/api/learning/progress/')) {
      if (options?.method === 'DELETE') {
        return Promise.resolve(handlers.reset?.() ?? jsonResponse(true, {}));
      }
      return Promise.resolve(handlers.progress?.() ?? jsonResponse(true, emptyProgress));
    }
    if (url.includes('/api/learning/roadmaps/')) {
      return Promise.resolve(handlers.roadmap?.() ?? jsonResponse(true, roadmap));
    }
    if (url.includes('/api/learning/roadmaps')) {
      return Promise.resolve(handlers.roadmaps?.() ?? jsonResponse(true, summaries));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

async function openRoadmapFromCatalog() {
  fireEvent.click(await screen.findByText('Your first architecture'));
  await screen.findByText('Create the web server');
}

describe('LearningPanel', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
  });

  it('lists the roadmap catalogue on open', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    render(<LearningPanel projectId="p1" onClose={() => {}} />);

    expect(await screen.findByText('Your first architecture')).toBeInTheDocument();
    expect(screen.getByText('Build a minimal two-tier architecture.')).toBeInTheDocument();
  });

  it('opens directly on the roadmap named by initialRoadmap', async () => {
    const fetchMock = buildFetchMock({});
    vi.stubGlobal('fetch', fetchMock);
    render(
      <LearningPanel
        projectId="p1"
        initialRoadmap={{ id: roadmap.id, language: 'en' }}
        onClose={() => {}}
      />
    );

    await screen.findByText('Create the web server');
    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    expect(urls.some(url => url.includes(`/api/learning/roadmaps/${roadmap.id}?language=en`))).toBe(true);
    expect(urls.some(url => url.includes(`/api/learning/progress/p1/${roadmap.id}`))).toBe(true);
  });

  it('stays on the catalogue when no initialRoadmap is given', async () => {
    const fetchMock = buildFetchMock({});
    vi.stubGlobal('fetch', fetchMock);
    render(<LearningPanel projectId="p1" onClose={() => {}} />);

    expect(await screen.findByText('Your first architecture')).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(call => String(call[0]));
    expect(urls.some(url => url.includes('/api/learning/roadmaps/'))).toBe(false);
  });

  it('shows a retry path when the catalogue cannot be loaded', async () => {
    const fetchMock = buildFetchMock({});
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    render(<LearningPanel projectId="p1" onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Your first architecture')).toBeInTheDocument();
  });

  it('opens a roadmap: only the current step is shown, with progress bar and instruction', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    render(<LearningPanel projectId="p1" onClose={() => {}} />);

    await openRoadmapFromCatalog();

    // Focus mode: other steps stay hidden until the learner reaches them.
    expect(screen.queryByText('Add the database')).not.toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Drag an Ubuntu node named web onto the canvas and start it.')
    ).toBeInTheDocument();
  });

  it('navigates between steps with skip/previous', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    render(<LearningPanel projectId="p1" onClose={() => {}} />);
    await openRoadmapFromCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Skip step' }));
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Add a Postgres node named db.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
  });

  it('validates the current step and renders pedagogical feedback', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    render(<LearningPanel projectId="p1" onClose={() => {}} />);
    await openRoadmapFromCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Not yet')).toBeInTheDocument();
    expect(
      screen.getByText('No container named "web" exists in this project yet.')
    ).toBeInTheDocument();
    // The toast stays terse: no expected/observed dump, no raw status/type strings.
    expect(screen.queryByText(/a running container named "web"/)).not.toBeInTheDocument();
    expect(screen.queryByText('[fail]')).not.toBeInTheDocument();
    expect(screen.queryByText('container_running')).not.toBeInTheDocument();
  });

  it('replaces failure feedback cleanly when a revalidation passes', async () => {
    let firstAttempt = true;
    vi.stubGlobal(
      'fetch',
      buildFetchMock({
        validate: () => {
          const body = firstAttempt ? failResponse : passResponse;
          firstAttempt = false;
          return jsonResponse(true, body);
        },
      })
    );
    render(<LearningPanel projectId="p1" onClose={() => {}} />);
    await openRoadmapFromCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('Not yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('Validation passed')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    // No artifacts from the failed attempt survive.
    expect(screen.queryByText('Not yet')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No container named "web" exists in this project yet.')
    ).not.toBeInTheDocument();
  });

  it('keeps navigation in the sidebar: the toast offers no Next step button', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ validate: () => jsonResponse(true, passResponse) }));
    render(<LearningPanel projectId="p1" onClose={() => {}} />);
    await openRoadmapFromCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await screen.findByText('Validation passed');

    expect(screen.queryByRole('button', { name: 'Next step' })).not.toBeInTheDocument();
  });

  it('closes the validation toast on dismiss and shows it again on the next attempt', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ validate: () => jsonResponse(true, passResponse) }));
    render(<LearningPanel projectId="p1" onClose={() => {}} />);
    await openRoadmapFromCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Validation passed')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('Validation passed')).toBeInTheDocument();
  });

  it('shows an understandable error with retry when the backend is unreachable during validation', async () => {
    let validateFails = true;
    vi.stubGlobal(
      'fetch',
      buildFetchMock({
        validate: () => {
          if (validateFails) throw new Error('network down');
          return jsonResponse(true, failResponse);
        },
      })
    );
    render(<LearningPanel projectId="p1" onClose={() => {}} />);
    await openRoadmapFromCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(
      await screen.findByText('Could not reach the server. Your work is untouched — try again.')
    ).toBeInTheDocument();

    validateFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Not yet')).toBeInTheDocument();
  });

  it('restores persisted progress: reopens on the first incomplete step with the bar filled', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock({
        progress: () =>
          jsonResponse(true, {
            ...emptyProgress,
            steps: { 'create-web-server': { passed: true, attempts: 2, revealedHints: 0 } },
          }),
      })
    );
    render(<LearningPanel projectId="p1" onClose={() => {}} />);

    fireEvent.click(await screen.findByText('Your first architecture'));

    expect(await screen.findByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    // Only the verdict is restored — no stale validator results are replayed.
    expect(screen.queryByText('Validation passed')).not.toBeInTheDocument();
  });

  it('restarts the roadmap behind a two-click confirmation', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock({
        progress: () =>
          jsonResponse(true, {
            ...emptyProgress,
            steps: { 'create-web-server': { passed: true, attempts: 1, revealedHints: 0 } },
          }),
      })
    );
    render(<LearningPanel projectId="p1" onClose={() => {}} />);
    fireEvent.click(await screen.findByText('Your first architecture'));
    expect(await screen.findByText('Step 2 of 2')).toBeInTheDocument();

    // First click only arms the confirmation — nothing is deleted yet.
    fireEvent.click(screen.getByRole('button', { name: 'Restart roadmap' }));
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sure? Click again to restart' }));

    expect(await screen.findByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('tells the user when an unreadable progress store was reset, dismissibly', async () => {
    vi.stubGlobal(
      'fetch',
      buildFetchMock({
        progress: () => jsonResponse(true, { ...emptyProgress, storeRecovered: true }),
      })
    );
    render(<LearningPanel projectId="p1" onClose={() => {}} />);
    await openRoadmapFromCatalog();

    expect(
      screen.getByText(/Your saved progress could not be read and had to be reset/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(
      screen.queryByText(/Your saved progress could not be read and had to be reset/)
    ).not.toBeInTheDocument();
  });

  it('calls onClose from the header button', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    const onClose = vi.fn();
    render(<LearningPanel projectId="p1" onClose={onClose} />);

    fireEvent.click(screen.getByTitle('Close panel'));

    expect(onClose).toHaveBeenCalled();
  });
});
