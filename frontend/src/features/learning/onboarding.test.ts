import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hasSeenLearningPitch, markLearningPitchSeen } from './onboarding';

describe('learning onboarding flag', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts unseen and stays seen once marked', () => {
    expect(hasSeenLearningPitch()).toBe(false);

    markLearningPitchSeen();

    expect(hasSeenLearningPitch()).toBe(true);
  });

  it('falls back to unseen when storage is unavailable, without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => markLearningPitchSeen()).not.toThrow();
    expect(hasSeenLearningPitch()).toBe(false);
  });
});
