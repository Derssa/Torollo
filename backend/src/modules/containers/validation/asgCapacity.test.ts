import { validateDesiredCapacity, validateAsgCapacityConfig, ASG_MAX_CAPACITY } from './asgCapacity';

describe('validateDesiredCapacity', () => {
  it('accepts undefined (controllers default it)', () => {
    expect(validateDesiredCapacity(undefined, 1)).toBeNull();
  });

  it.each([1, 5, ASG_MAX_CAPACITY])('accepts %d with floor 1', value => {
    expect(validateDesiredCapacity(value, 1)).toBeNull();
  });

  it('accepts 0 with floor 0 (stop path)', () => {
    expect(validateDesiredCapacity(0, 0)).toBeNull();
  });

  it('rejects 0 with floor 1 (deploy path)', () => {
    expect(validateDesiredCapacity(0, 1)).toMatchObject({ code: 'INVALID_CAPACITY' });
  });

  it.each([11, -1, 100])('rejects out-of-range %d', value => {
    const result = validateDesiredCapacity(value, 0);
    expect(result).toMatchObject({ code: 'INVALID_CAPACITY' });
    expect(result?.message).toContain('between 0 and 10');
  });

  it.each([[2.5], [NaN], ['5'], [null], [{}]])('rejects non-integer %p', value => {
    const result = validateDesiredCapacity(value, 0);
    expect(result).toMatchObject({ code: 'INVALID_CAPACITY' });
    expect(result?.message).toContain('whole number');
  });
});

describe('validateAsgCapacityConfig', () => {
  it('accepts a full valid entry', () => {
    expect(validateAsgCapacityConfig('asg-1', { minCapacity: 1, desiredCapacity: 2, maxCapacity: 4 })).toBeNull();
  });

  it('accepts partial entries (legacy configs)', () => {
    expect(validateAsgCapacityConfig('asg-1', { parentId: 'x', subnetIds: [] })).toBeNull();
    expect(validateAsgCapacityConfig('asg-1', { desiredCapacity: 3 })).toBeNull();
  });

  it('ignores non-object entries', () => {
    expect(validateAsgCapacityConfig('asg-1', null)).toBeNull();
    expect(validateAsgCapacityConfig('asg-1', 'junk')).toBeNull();
  });

  it.each([
    ['minCapacity 0', { minCapacity: 0 }],
    ['maxCapacity 11', { maxCapacity: 11 }],
    ['maxCapacity 50', { maxCapacity: 50 }],
    ['desiredCapacity -1', { desiredCapacity: -1 }],
    ['non-integer desiredCapacity', { desiredCapacity: 2.5 }],
    ['string maxCapacity', { maxCapacity: '4' }],
  ])('rejects %s', (_label, entry) => {
    const result = validateAsgCapacityConfig('asg-1', entry);
    expect(result).toMatchObject({ code: 'INVALID_CAPACITY' });
    expect(result?.message).toContain('asg-1');
  });

  it('rejects minCapacity > maxCapacity', () => {
    const result = validateAsgCapacityConfig('asg-1', { minCapacity: 5, maxCapacity: 3 });
    expect(result?.message).toContain('minCapacity');
  });

  it('rejects desiredCapacity below minCapacity', () => {
    const result = validateAsgCapacityConfig('asg-1', { minCapacity: 2, desiredCapacity: 1, maxCapacity: 4 });
    expect(result?.message).toContain('less than minCapacity');
  });

  it('rejects desiredCapacity above maxCapacity', () => {
    const result = validateAsgCapacityConfig('asg-1', { minCapacity: 1, desiredCapacity: 5, maxCapacity: 4 });
    expect(result?.message).toContain('greater than maxCapacity');
  });
});
