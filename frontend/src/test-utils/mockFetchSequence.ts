import { vi } from 'vitest';

interface MockedFetchResponse {
  ok: boolean;
  json: unknown;
}

/** Queues a sequence of fetch responses for a test. Not used by production code. */
export function mockFetchResponses(responses: MockedFetchResponse[]) {
  const fetchMock = vi.fn();
  responses.forEach(r => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: r.ok, json: () => Promise.resolve(r.json) } as Response)
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
