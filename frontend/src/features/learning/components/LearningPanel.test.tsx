import '../../../i18n';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LearningPanel from './LearningPanel';
import type {
  Roadmap,
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

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

/** Routes fetch calls by URL so the catalogue, roadmap and validate endpoints can be scripted independently. */
function buildFetchMock(handlers: {
  roadmaps?: () => Response;
  roadmap?: () => Response;
  validate?: () => Response;
}) {
  return vi.fn((url: string) => {
    if (url.includes('/api/learning/validate')) {
      return Promise.resolve(handlers.validate?.() ?? jsonResponse(true, failResponse));
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
  // The current step's title appears twice: in the step list and in the detail block.
  await screen.findAllByText('Create the web server');
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
    expect(screen.getByText('EN')).toBeInTheDocument();
  });

  it('shows a retry path when the catalogue cannot be loaded', async () => {
    const fetchMock = buildFetchMock({});
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    render(<LearningPanel projectId="p1" onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Your first architecture')).toBeInTheDocument();
  });

  it('opens a roadmap: all steps listed, current step highlighted, instruction shown', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    render(<LearningPanel projectId="p1" onClose={() => {}} />);

    await openRoadmapFromCatalog();

    expect(screen.getByText('Add the database')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(
      screen.getByText('Drag an Ubuntu node named `web` onto the canvas and start it.')
    ).toBeInTheDocument();
  });

  it('navigates between steps with next/previous', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    render(<LearningPanel projectId="p1" onClose={() => {}} />);
    await openRoadmapFromCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Add a Postgres node named `db`.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
  });

  it('validates the current step and renders the raw results', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    render(<LearningPanel projectId="p1" onClose={() => {}} />);
    await openRoadmapFromCatalog();

    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Not yet — see the results below')).toBeInTheDocument();
    expect(
      screen.getByText('No container named "web" exists in this project yet.')
    ).toBeInTheDocument();
    expect(screen.getByText(/a running container named "web"/)).toBeInTheDocument();
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
    expect(await screen.findByText('Not yet — see the results below')).toBeInTheDocument();
  });

  it('calls onClose from the header button', async () => {
    vi.stubGlobal('fetch', buildFetchMock({}));
    const onClose = vi.fn();
    render(<LearningPanel projectId="p1" onClose={onClose} />);

    fireEvent.click(screen.getByTitle('Close panel'));

    expect(onClose).toHaveBeenCalled();
  });
});
