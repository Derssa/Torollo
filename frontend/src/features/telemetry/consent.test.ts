import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getInstallId,
  getTelemetryConsent,
  setTelemetryConsent,
  subscribeTelemetryConsent,
} from './consent';

describe('telemetry consent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to unset when nothing is stored', () => {
    expect(getTelemetryConsent()).toBe('unset');
  });

  it('round-trips accepted and declined', () => {
    setTelemetryConsent('accepted');
    expect(getTelemetryConsent()).toBe('accepted');
    setTelemetryConsent('declined');
    expect(getTelemetryConsent()).toBe('declined');
  });

  it('treats an unknown stored value as unset', () => {
    localStorage.setItem('torollo_telemetry_consent', 'yes-please');
    expect(getTelemetryConsent()).toBe('unset');
  });

  it('falls back to unset when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(getTelemetryConsent()).toBe('unset');
    spy.mockRestore();
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTelemetryConsent(listener);
    setTelemetryConsent('accepted');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setTelemetryConsent('declined');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps the install id stable across calls', () => {
    const first = getInstallId();
    expect(first).toBeTruthy();
    expect(getInstallId()).toBe(first);
  });

  it('forgets the claimed milestones when consent is revoked', () => {
    setTelemetryConsent('accepted');
    localStorage.setItem('torollo_telemetry_milestones', '["first_validator_run"]');
    setTelemetryConsent('declined');
    expect(localStorage.getItem('torollo_telemetry_milestones')).toBeNull();
  });

  it('forgets the install id when consent is revoked', () => {
    setTelemetryConsent('accepted');
    const first = getInstallId();
    setTelemetryConsent('declined');
    expect(localStorage.getItem('torollo_telemetry_install_id')).toBeNull();
    setTelemetryConsent('accepted');
    expect(getInstallId()).not.toBe(first);
  });
});
