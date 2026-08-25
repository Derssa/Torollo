import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBootTelemetry } from './useBootTelemetry';
import { setTelemetryConsent } from './consent';
import { trackEvent } from './telemetry';
import { probeDockerHealth } from '../../shared/hooks/useDockerHealth';

vi.mock('./telemetry', () => ({ trackEvent: vi.fn() }));
vi.mock('../../shared/hooks/useDockerHealth', () => ({ probeDockerHealth: vi.fn() }));
const trackEventMock = vi.mocked(trackEvent);
const probeMock = vi.mocked(probeDockerHealth);

const eventNames = () => trackEventMock.mock.calls.map(([name]) => name);

describe('useBootTelemetry', () => {
  beforeEach(() => {
    localStorage.clear();
    trackEventMock.mockClear();
    probeMock.mockReset();
    probeMock.mockResolvedValue({ status: 'ok' });
  });

  it('does nothing — not even the health probe — without consent', () => {
    renderHook(() => useBootTelemetry());
    expect(trackEventMock).not.toHaveBeenCalled();
    expect(probeMock).not.toHaveBeenCalled();
  });

  it('reports app_started and a ready runtime when consent was already given', async () => {
    setTelemetryConsent('accepted');
    renderHook(() => useBootTelemetry());
    await act(async () => {});

    expect(eventNames()).toEqual(['app_started', 'runtime_check_started', 'runtime_ready']);
  });

  it('reports the failure reason when the runtime is down', async () => {
    setTelemetryConsent('accepted');
    probeMock.mockResolvedValue({ status: 'down', reason: 'socket_not_found' });
    renderHook(() => useBootTelemetry());
    await act(async () => {});

    expect(eventNames()).toEqual(['app_started', 'runtime_check_started', 'runtime_failed']);
    expect(trackEventMock).toHaveBeenCalledWith('runtime_failed', { reason: 'socket_not_found' });
  });

  it('fires once consent is accepted mid-session, and only once per page load', async () => {
    const { rerender } = renderHook(() => useBootTelemetry());
    expect(trackEventMock).not.toHaveBeenCalled();

    await act(async () => {
      setTelemetryConsent('accepted');
    });
    expect(eventNames()).toEqual(['app_started', 'runtime_check_started', 'runtime_ready']);

    await act(async () => {
      setTelemetryConsent('declined');
      setTelemetryConsent('accepted');
    });
    rerender();
    expect(trackEventMock).toHaveBeenCalledTimes(3);
    expect(probeMock).toHaveBeenCalledTimes(1);
  });
});
