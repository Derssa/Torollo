import '../../../i18n';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import RedisModal from './RedisModal';
import { mockFetchResponses } from '../../../test-utils/mockFetchSequence';

async function renderModal(onClose = vi.fn()) {
  const view = render(<RedisModal containerId="c1" nodeName="cache-1" projectId="p1" onClose={onClose} />);
  // Flush the mount effect's explorer fetch so it never resolves after the test returns.
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe('RedisModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders all 4 tabs and defaults to the details tab', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    await renderModal();

    expect(screen.getByRole('button', { name: /Details/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Key Explorer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Redis Shell/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Redis Cheat Sheet/i })).toBeInTheDocument();
    expect(screen.getByText('Cache Node Details')).toBeInTheDocument();
  });

  it('switches tab content when a tab button is clicked', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Redis Shell/i }));

    expect(screen.getByText('redis-cli')).toBeInTheDocument();
    expect(screen.queryByText('Cache Node Details')).not.toBeInTheDocument();
  });

  it('fetches and renders keys in the explorer tab on success', async () => {
    mockFetchResponses([{ ok: true, json: [{ key: 'user:1', type: 'hash' }] }]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Key Explorer/i }));

    await waitFor(() => expect(screen.getByText('user:1')).toBeInTheDocument());
    expect(screen.getByText('hash')).toBeInTheDocument();
  });

  it('shows an error message with a retry button on a non-startup explorer error', async () => {
    const fetchMock = mockFetchResponses([{ ok: false, json: { error: 'connection refused' } }]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Key Explorer/i }));

    await waitFor(() => expect(screen.getByText('connection refused')).toBeInTheDocument());
    const retryBtn = screen.getByRole('button', { name: /Retry Key Scan/i });

    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response));
    fireEvent.click(retryBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('shows the initializing state and auto-retries once after 2.5s on a "starting up" error', async () => {
    // Fake timers are required to deterministically control the 2.5s auto-retry
    // without RTL's waitFor (which polls via real setTimeout and would hang here).
    vi.useFakeTimers();
    const fetchMock = mockFetchResponses([
      { ok: false, json: { error: 'Redis is starting up' } },
      { ok: true, json: [] },
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Key Explorer/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText(/initializing/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not stack overlapping auto-retry timers when "starting up" fires repeatedly', async () => {
    // Two consecutive "starting up" responses: the second must clear/replace the first
    // timer (retryTimerRef guard) rather than scheduling a second overlapping retry.
    vi.useFakeTimers();
    const fetchMock = mockFetchResponses([
      { ok: false, json: { error: 'Redis is starting up' } },
      { ok: false, json: { error: 'Redis is starting up' } },
      { ok: true, json: [] },
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Key Explorer/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Manually retry before the 2.5s auto-retry fires — this re-enters the "starting up"
    // branch and must clear the first pending timer rather than adding a second one.
    // The "starting up" view shows no dedicated retry button, only the refresh icon
    // button next to the section title.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const refreshBtn = screen.getAllByRole('button').find(b => b.querySelector('svg.lucide-refresh-cw'))!;
    fireEvent.click(refreshBtn);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Only one retry should fire at 2.5s after the second "starting up" response, not two.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Confirm no leftover timer fires a 4th call later.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('executes a shell command and renders the result', async () => {
    const fetchMock = mockFetchResponses([
      { ok: true, json: [] }, // mount explorer fetch
      { ok: true, json: { result: 'OK' } }, // query execute
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Redis Shell/i }));
    const textarea = screen.getByPlaceholderText(/redis-cli command/i);
    fireEvent.change(textarea, { target: { value: 'SET foo bar' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Command/i }));

    await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument());
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ query: 'SET foo bar' });
  });

  it('renders an ERROR-prefixed message when the shell command fails', async () => {
    mockFetchResponses([
      { ok: true, json: [] },
      { ok: false, json: { error: 'unknown command' } },
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Redis Shell/i }));
    fireEvent.change(screen.getByPlaceholderText(/redis-cli command/i), { target: { value: 'BADCMD' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Command/i }));

    await waitFor(() => expect(screen.getByText('ERROR: unknown command')).toBeInTheDocument());
  });

  it('re-fetches explorer data after a successful shell command', async () => {
    const fetchMock = mockFetchResponses([
      { ok: true, json: [] }, // mount explorer fetch
      { ok: true, json: { result: 'OK' } }, // query execute
      { ok: true, json: [{ key: 'foo', type: 'string' }] }, // post-write re-fetch
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Redis Shell/i }));
    fireEvent.change(screen.getByPlaceholderText(/redis-cli command/i), { target: { value: 'SET foo bar' } });
    fireEvent.click(screen.getByRole('button', { name: /Run Command/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it.each([
    ['list', 'LRANGE mylist 0 -1'],
    ['hash', 'HGETALL myhash'],
    ['set', 'SMEMBERS myset'],
    ['zset', 'ZRANGE myzset 0 -1 WITHSCORES'],
    ['stream', 'XRANGE mystream - +'],
    ['string', 'GET mystring'],
  ])('handleViewValue for type "%s" switches to shell with command "%s" and runs it', async (type, expectedCommand) => {
    const key = { string: 'mystring', list: 'mylist', hash: 'myhash', set: 'myset', zset: 'myzset', stream: 'mystream' }[type];
    const fetchMock = mockFetchResponses([
      { ok: true, json: [{ key, type }] }, // mount explorer fetch
      { ok: true, json: { result: 'value' } }, // triggered query
    ]);
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Key Explorer/i }));
    await waitFor(() => expect(screen.getByText(key!)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /View Value/i }));

    expect(screen.getByText('redis-cli')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ query: expectedCommand });
  });

  it('filters the cheat sheet by search query and copies an entry to the clipboard', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Redis Cheat Sheet/i }));
    expect(screen.getByText('Set Key')).toBeInTheDocument();
    expect(screen.getByText('Get Key')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search Redis commands/i), { target: { value: 'Set Key' } });
    expect(screen.getByText('Set Key')).toBeInTheDocument();
    expect(screen.queryByText('Get Key')).not.toBeInTheDocument();

    const card = screen.getByText('Set Key').closest('div')!.parentElement!;
    const copyBtn = within(card as HTMLElement).getAllByRole('button')[0];
    fireEvent.click(copyBtn);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('SET user:1:name "Alice Smith"'));
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
