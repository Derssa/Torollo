import '../../../i18n';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import PostgresModal from './PostgresModal';
import { mockFetchResponses } from '../../../test-utils/mockFetchSequence';

async function renderModal(onClose = vi.fn()) {
  const view = render(<PostgresModal containerId="c1" nodeName="db-1" projectId="p1" onClose={onClose} />);
  // Flush the mount effect's explorer fetch so it never resolves after the test returns.
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe('PostgresModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders all 5 tabs and defaults to the details tab', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    await renderModal();

    expect(screen.getByRole('button', { name: /Details & Config/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Simulation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Database Explorer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SQL Shell/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SQL Cheat Sheet/i })).toBeInTheDocument();
  });

  it('switches tab content when a tab button is clicked', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /SQL Shell/i }));

    expect(screen.getByText('Target Database:')).toBeInTheDocument();
  });

  it('renders the simulation tab without throwing (smoke test only)', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    await renderModal();

    expect(() => fireEvent.click(screen.getByRole('button', { name: /^Simulation$/i }))).not.toThrow();
    expect(screen.getByText('Reads Handled')).toBeInTheDocument();
    expect(screen.getByText('Writes Handled')).toBeInTheDocument();
  });

  it('fetches and renders the database/table tree in the explorer tab, expanding to show columns', async () => {
    mockFetchResponses([
      { ok: true, json: [{ database: 'app_db', tables: [{ name: 'users', columns: [{ name: 'id', type: 'integer' }] }] }] },
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Database Explorer/i }));
    // The shell tab (mounted but hidden) lists databases in its <select> too,
    // so scope the query to the explorer tree's span.
    await waitFor(() => expect(screen.getByText('app_db', { selector: 'span' })).toBeInTheDocument());

    // Database node starts collapsed by default (only 'postgres' is pre-expanded).
    expect(screen.queryByText('users')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('app_db', { selector: 'span' }));
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.queryByText('id')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('users'));
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('integer')).toBeInTheDocument();
  });

  it('shows an error message with a retry button on a non-startup explorer error', async () => {
    const fetchMock = mockFetchResponses([{ ok: false, json: { error: 'connection refused' } }]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Database Explorer/i }));

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

    fireEvent.click(screen.getByRole('button', { name: /Database Explorer/i }));
    expect(screen.getByText(/initializing/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('populates the target database select from explorer data and executes a query', async () => {
    const fetchMock = mockFetchResponses([
      { ok: true, json: [{ database: 'app_db', tables: [] }] }, // mount explorer fetch
      { ok: true, json: { result: 'SELECT 1' } }, // query execute
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /SQL Shell/i }));
    expect(within(screen.getByRole('combobox')).getByRole('option', { name: 'app_db' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Write your SQL statements/i), { target: { value: 'SELECT 1;' } });
    fireEvent.click(screen.getByRole('button', { name: /Execute Query/i }));

    await waitFor(() => expect(screen.getByText('SELECT 1')).toBeInTheDocument());
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ query: 'SELECT 1;', database: 'postgres' });
  });

  it('renders an ERROR-prefixed message when the query fails', async () => {
    mockFetchResponses([
      { ok: true, json: [] },
      { ok: false, json: { error: 'syntax error' } },
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /SQL Shell/i }));
    fireEvent.change(screen.getByPlaceholderText(/Write your SQL statements/i), { target: { value: 'BAD SQL' } });
    fireEvent.click(screen.getByRole('button', { name: /Execute Query/i }));

    await waitFor(() => expect(screen.getByText('ERROR: syntax error')).toBeInTheDocument());
  });

  it('clicking "View Data" on a table switches to the shell tab, runs a SELECT, and renders the result', async () => {
    const fetchMock = mockFetchResponses([
      { ok: true, json: [{ database: 'app_db', tables: [{ name: 'users', columns: [] }] }] }, // mount explorer fetch
      { ok: true, json: { result: '1 row(s)' } }, // triggered query
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Database Explorer/i }));
    await waitFor(() => expect(screen.getByText('app_db', { selector: 'span' })).toBeInTheDocument());
    fireEvent.click(screen.getByText('app_db', { selector: 'span' }));
    fireEvent.click(screen.getByRole('button', { name: /View Data/i }));

    expect(screen.getByText('Target Database:')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1 row(s)')).toBeInTheDocument());
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ query: 'SELECT * FROM users LIMIT 100;', database: 'app_db' });
  });

  it('filters the cheat sheet by search query and copies an entry to the clipboard', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /SQL Cheat Sheet/i }));
    expect(screen.getByText('Connect to Database')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search SQL commands/i), { target: { value: 'Connect to Database' } });
    expect(screen.getByText('Connect to Database')).toBeInTheDocument();

    const card = screen.getByText('Connect to Database').closest('div')!.parentElement!;
    const copyBtn = within(card as HTMLElement).getAllByRole('button')[0];
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith('\\c database_name');
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
