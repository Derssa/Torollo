import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackEvent } from './telemetry';
import { setTelemetryConsent } from './consent';

describe('trackEvent', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('performs zero network requests while consent is unset', () => {
    trackEvent('roadmap_started', { roadmap: 'r1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('performs zero network requests when consent is declined', () => {
    setTelemetryConsent('declined');
    trackEvent('step_validated', { roadmap: 'r1', step: 's1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends one Plausible-shaped event when consent is accepted', () => {
    setTelemetryConsent('accepted');
    trackEvent('step_failed', { roadmap: 'r1', step: 's2' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(false);
    const payload = JSON.parse(init.body);
    expect(payload.name).toBe('step_failed');
    expect(payload.domain).toBeTruthy();
    expect(payload.url).toBe('app://torollo/roadmap/r1');
    expect(payload.props.roadmap).toBe('r1');
    expect(payload.props.step).toBe('s2');
    expect(payload.props.install_id).toBeTruthy();
    expect(payload.props.app_version).toBeTruthy();
    // The exhaustive prop list — anything beyond it would be an undocumented
    // (and potentially identifying) leak.
    expect(Object.keys(payload.props).sort()).toEqual([
      'app_version',
      'install_id',
      'roadmap',
      'step',
    ]);
  });

  it('reuses the same install id across events', () => {
    setTelemetryConsent('accepted');
    trackEvent('roadmap_started', { roadmap: 'r1' });
    trackEvent('roadmap_completed', { roadmap: 'r1' });
    const ids = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).props.install_id);
    expect(ids[0]).toBe(ids[1]);
  });

  it('passes keepalive through for exit events', () => {
    setTelemetryConsent('accepted');
    trackEvent('roadmap_abandoned', { roadmap: 'r1', step: 's3' }, { keepalive: true });
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('never throws when the network call fails', async () => {
    setTelemetryConsent('accepted');
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => trackEvent('roadmap_started', { roadmap: 'r1' })).not.toThrow();
    // Let the rejected promise settle — the .catch inside must absorb it.
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});
