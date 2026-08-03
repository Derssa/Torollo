const STORAGE_KEY = 'torollo-learning-pitch-seen';

/**
 * Whether the first-run learning pitch (hero + why-panel + sample receipt) has
 * already been shown and acted on.
 *
 * Derived state — "no roadmap has any completed step" — is not enough on its
 * own: someone who launches a roadmap and validates nothing would be pitched
 * again on every visit, and the pitch is an introduction, not a dashboard.
 * The flag lives in localStorage like the canvas layout: it is per browser
 * profile, and losing it only re-shows the pitch, never data.
 */
export function hasSeenLearningPitch(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // Storage disabled (private mode, hardened profile): fall back to the
    // derived detection rather than breaking the page.
    return false;
  }
}

/** Called when a roadmap is actually launched — the pitch has done its job. */
export function markLearningPitchSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // See above: a pitch shown twice is better than a crash.
  }
}
