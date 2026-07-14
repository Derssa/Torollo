import '../../../i18n';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import NoSqlModal from './NoSqlModal';
import { mockFetchResponses } from '../../../test-utils/mockFetchSequence';

async function renderModal(onClose = vi.fn()) {
  const view = render(<NoSqlModal containerId="c1" nodeName="db-1" projectId="p1" onClose={onClose} />);
  // Flush the mount effect's explorer fetch so it never resolves after the test returns.
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe('NoSqlModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders all 5 tabs and defaults to the details tab', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    await renderModal();

    expect(screen.getByRole('button', { name: /Details & Config/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Simulation$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NoSQL Explorer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mongo Shell/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mongo Cheat Sheet/i })).toBeInTheDocument();
  });

  it('switches tab content when a tab button is clicked', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Mongo Shell/i }));

    expect(screen.getByPlaceholderText(/db.users.find/i)).toBeInTheDocument();
  });

  it('renders the simulation tab without throwing (smoke test only)', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    await renderModal();

    expect(() => fireEvent.click(screen.getByRole('button', { name: /^Simulation$/i }))).not.toThrow();
    expect(screen.getByText(/Routed/i)).toBeInTheDocument();
  });

  it('fetches and renders the database/collection tree in the explorer tab, expanding to show columns', async () => {
    mockFetchResponses([
      { ok: true, json: [{ database: 'app_db', tables: [{ name: 'users', columns: [{ name: '_id', type: 'ObjectId' }] }] }] },
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /NoSQL Explorer/i }));
    await waitFor(() => expect(screen.getByText('app_db')).toBeInTheDocument());

    // Database node starts collapsed by default (only 'test' is pre-expanded).
    expect(screen.queryByText('users (Collection)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('app_db'));
    expect(screen.getByText('users (Collection)')).toBeInTheDocument();
    expect(screen.queryByText('_id')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('users (Collection)'));
    expect(screen.getByText('_id')).toBeInTheDocument();
    expect(screen.getByText('ObjectId')).toBeInTheDocument();
  });

  it('shows a non-startup explorer error with a retry button (aligned with Postgres/Redis)', async () => {
    const fetchMock = mockFetchResponses([{ ok: false, json: { error: 'connection refused' } }]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /NoSQL Explorer/i }));

    await waitFor(() => expect(screen.getByText('connection refused')).toBeInTheDocument());
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response));
    fireEvent.click(screen.getByRole('button', { name: /Retry Schema Scan/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('shows the initializing state and auto-retries once after 2.5s on a "starting up" error', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetchResponses([
      { ok: false, json: { error: 'Database is starting up' } },
      { ok: true, json: [] },
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /NoSQL Explorer/i }));
    expect(screen.getByText(/initializing/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('executes a query and renders the result, re-fetching explorer data', async () => {
    const fetchMock = mockFetchResponses([
      { ok: true, json: [] }, // mount explorer fetch
      { ok: true, json: { result: '{ acknowledged: true }' } }, // query execute
      { ok: true, json: [] }, // post-write re-fetch
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Mongo Shell/i }));
    fireEvent.change(screen.getByPlaceholderText(/db.users.find/i), { target: { value: "db.users.find({})" } });
    fireEvent.click(screen.getByRole('button', { name: /Evaluate Query/i }));

    await waitFor(() => expect(screen.getByText('{ acknowledged: true }')).toBeInTheDocument());
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ query: 'db.users.find({})' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it('renders an ERROR-prefixed message when the query fails', async () => {
    mockFetchResponses([
      { ok: true, json: [] },
      { ok: false, json: { error: 'unknown operator' } },
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Mongo Shell/i }));
    fireEvent.change(screen.getByPlaceholderText(/db.users.find/i), { target: { value: 'db.users.bad()' } });
    fireEvent.click(screen.getByRole('button', { name: /Evaluate Query/i }));

    await waitFor(() => expect(screen.getByText('ERROR: unknown operator')).toBeInTheDocument());
  });

  it('clicking "View Documents" on a collection switches to the shell tab, runs a find query, and renders the result', async () => {
    const fetchMock = mockFetchResponses([
      { ok: true, json: [{ database: 'app_db', tables: [{ name: 'users', columns: [] }] }] }, // mount explorer fetch
      { ok: true, json: { result: '[{ "_id": 1 }]' } }, // triggered query
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /NoSQL Explorer/i }));
    await waitFor(() => expect(screen.getByText('app_db')).toBeInTheDocument());
    fireEvent.click(screen.getByText('app_db'));
    fireEvent.click(screen.getByRole('button', { name: /View Documents/i }));

    expect(screen.getByPlaceholderText(/db.users.find/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('[{ "_id": 1 }]')).toBeInTheDocument());
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      query: "JSON.stringify(db.getSiblingDB('app_db').getCollection('users').find().limit(10).toArray(), null, 2)",
    });
  });

  it('filters the cheat sheet by search query and copies an entry to the clipboard', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Mongo Cheat Sheet/i }));
    expect(screen.getByText('Insert Document')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search Mongo commands/i), { target: { value: 'Insert Document' } });
    expect(screen.getByText('Insert Document')).toBeInTheDocument();

    const card = screen.getByText('Insert Document').closest('div')!.parentElement!;
    const copyBtn = within(card as HTMLElement).getAllByRole('button')[0];
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith('db.users.insertOne({ name: "Alice", age: 30, roles: ["admin"] })');
  });

  it('calls onClose when the close button is clicked', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    const onClose = vi.fn();
    const { container } = await renderModal(onClose);

    // The close button has no accessible name, only the lucide X icon.
    const closeBtn = [...container.querySelectorAll('button')].find(b => b.querySelector('svg.lucide-x'))!;
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
