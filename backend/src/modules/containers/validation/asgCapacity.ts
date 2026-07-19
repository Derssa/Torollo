export const ASG_MAX_CAPACITY = 10;

export interface CapacityViolation {
  code: 'INVALID_CAPACITY';
  message: string;
}

function violation(message: string): CapacityViolation {
  return { code: 'INVALID_CAPACITY', message };
}

function isIntegerIn(value: unknown, floor: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= floor && value <= ASG_MAX_CAPACITY;
}

/**
 * Bounds check for the `desiredCapacity` of a scale/deploy request.
 * `floor` is 0 for scaling (stopping an ASG scales it to 0) and 1 for deploys.
 * An undefined value is accepted: controllers default it to 1.
 */
export function validateDesiredCapacity(value: unknown, floor: 0 | 1): CapacityViolation | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return violation('Desired capacity must be a whole number.');
  }
  if (value < floor || value > ASG_MAX_CAPACITY) {
    return violation(`Desired capacity must be between ${floor} and ${ASG_MAX_CAPACITY}.`);
  }
  return null;
}

/**
 * Bounds check for one `networkConfig.asgs` entry. Lenient on purpose: only
 * the capacity fields that are present are validated, so partial entries and
 * configs saved by older versions keep saving.
 */
export function validateAsgCapacityConfig(asgId: string, entry: unknown): CapacityViolation | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const { desiredCapacity, minCapacity, maxCapacity } = entry as Record<string, unknown>;

  for (const [field, value] of Object.entries({ desiredCapacity, minCapacity, maxCapacity })) {
    if (value !== undefined && !isIntegerIn(value, 1)) {
      return violation(`ASG "${asgId}": ${field} must be a whole number between 1 and ${ASG_MAX_CAPACITY}.`);
    }
  }

  if (minCapacity !== undefined && maxCapacity !== undefined && (minCapacity as number) > (maxCapacity as number)) {
    return violation(`ASG "${asgId}": minCapacity cannot be greater than maxCapacity.`);
  }
  if (minCapacity !== undefined && desiredCapacity !== undefined && (desiredCapacity as number) < (minCapacity as number)) {
    return violation(`ASG "${asgId}": desiredCapacity cannot be less than minCapacity.`);
  }
  if (maxCapacity !== undefined && desiredCapacity !== undefined && (desiredCapacity as number) > (maxCapacity as number)) {
    return violation(`ASG "${asgId}": desiredCapacity cannot be greater than maxCapacity.`);
  }
  return null;
}
