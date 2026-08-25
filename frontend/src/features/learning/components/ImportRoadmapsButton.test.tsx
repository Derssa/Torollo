import '../../../i18n';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportRoadmapsButton from './ImportRoadmapsButton';
import type { ImportReport } from '../../../shared/types/roadmap';

function mockImportResponses(responses: Array<{ status: number; json: unknown }>) {
  const fetchMock = vi.fn();
  responses.forEach(r => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ status: r.status, json: () => Promise.resolve(r.json) } as Response)
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function selectFile(name: string, content = '{}') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], name, { type: 'application/octet-stream' });
  // jsdom's File has no arrayBuffer() — polyfill just for the component call.
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(new TextEncoder().encode(content).buffer),
  });
  fireEvent.change(input, { target: { files: [file] } });
}

const installedReport: ImportReport = {
  imported: [
    { file: 'pack-roadmap.json', id: 'pack-roadmap', language: 'en', title: 'Pack roadmap', updated: false },
  ],
  rejected: [],
  ignored: [],
};

describe('ImportRoadmapsButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uploads the picked file as raw bytes and shows what was installed', async () => {
    const fetchMock = mockImportResponses([{ status: 200, json: installedReport }]);
    const onImported = vi.fn();
    render(<ImportRoadmapsButton onImported={onImported} />);

    fireEvent.click(screen.getByRole('button', { name: /import roadmaps/i }));
    selectFile('pack.zip');

    await waitFor(() => expect(screen.getByText('Pack roadmap')).toBeInTheDocument());
    expect(screen.getByText('1 roadmap imported')).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/learning/roadmaps/import?filename=pack.zip');
    expect((init as RequestInit).headers).toEqual({ 'Content-Type': 'application/octet-stream' });
  });

  it('shows the per-file reasons when the upload is refused (422), and does not refetch', async () => {
    const rejectedReport: ImportReport = {
      imported: [],
      rejected: [{ file: 'broken.json', errors: ['/steps: must be an array'] }],
      ignored: [],
    };
    mockImportResponses([{ status: 422, json: rejectedReport }]);
    const onImported = vi.fn();
    render(<ImportRoadmapsButton onImported={onImported} />);

    selectFile('broken.json');

    await waitFor(() => expect(screen.getByText('broken.json')).toBeInTheDocument());
    expect(screen.getByText('1 file not imported')).toBeInTheDocument();
    expect(screen.getByText('/steps: must be an array')).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('reports a network failure without crashing', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('down')));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ImportRoadmapsButton onImported={vi.fn()} />);

    selectFile('pack.zip');

    await waitFor(() =>
      expect(screen.getByText(/could not be sent/i)).toBeInTheDocument()
    );
  });

  it('closes the report modal', async () => {
    mockImportResponses([{ status: 200, json: installedReport }]);
    render(<ImportRoadmapsButton onImported={vi.fn()} />);

    selectFile('pack.zip');
    await waitFor(() => expect(screen.getByText('Pack roadmap')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('Pack roadmap')).not.toBeInTheDocument();
  });
});
