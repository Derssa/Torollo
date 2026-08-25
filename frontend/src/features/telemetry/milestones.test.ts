import { describe, it, expect, beforeEach, vi } from 'vitest';
import { claimMilestone } from './milestones';
import { setTelemetryConsent } from './consent';

describe('claimMilestone', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is true the first time and false afterwards', () => {
    expect(claimMilestone('first_validator_run')).toBe(true);
    expect(claimMilestone('first_validator_run')).toBe(false);
    expect(claimMilestone('first_validator_run')).toBe(false);
  });

  it('survives a corrupted store by starting over', () => {
    localStorage.setItem('torollo_telemetry_milestones', '{not json');
    expect(() => claimMilestone('first_validator_run')).not.toThrow();
    expect(claimMilestone('first_validator_run')).toBe(false);
  });

  it('claims again after consent is revoked, like a fresh install', () => {
    setTelemetryConsent('accepted');
    expect(claimMilestone('first_validator_run')).toBe(true);
    setTelemetryConsent('declined');
    setTelemetryConsent('accepted');
    expect(claimMilestone('first_validator_run')).toBe(true);
  });

  it('treats every call as a first when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(claimMilestone('first_validator_run')).toBe(true);
    spy.mockRestore();
  });
});
