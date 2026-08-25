import { MILESTONES_KEY } from './storageKeys';

/** Once-per-install events. Extend the union when a new "first" is tracked. */
export type TelemetryMilestone = 'first_validator_run';

/**
 * Claims a milestone: true the first time it is called for this install,
 * false on every later call. Claims live next to the install id and are
 * wiped with it on revocation, so a fresh identity gets its "firsts" again.
 *
 * Without storage every call is a first — a duplicate event beats a lost one.
 */
export function claimMilestone(name: TelemetryMilestone): boolean {
  try {
    const claimed = readClaimed();
    if (claimed.includes(name)) return false;
    localStorage.setItem(MILESTONES_KEY, JSON.stringify([...claimed, name]));
    return true;
  } catch {
    return true;
  }
}

/** A corrupted store reads as empty and is overwritten by the next claim. */
function readClaimed(): string[] {
  const raw = localStorage.getItem(MILESTONES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
