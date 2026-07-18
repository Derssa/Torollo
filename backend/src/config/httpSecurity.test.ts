import { isAllowedOrigin, parseAllowedOrigins } from './httpSecurity';

describe('isAllowedOrigin', () => {
  it('allows requests without an Origin header', () => {
    expect(isAllowedOrigin(undefined, [])).toBe(true);
  });

  it.each([
    'http://localhost:23232',
    'http://localhost:51234',
    'http://127.0.0.1:23233',
    'http://[::1]:23232',
    'https://localhost:23232'
  ])('allows local origin %s on any port', origin => {
    expect(isAllowedOrigin(origin, [])).toBe(true);
  });

  it.each([
    'https://evil.com',
    'http://localhost.evil.com:23232',
    'http://192.168.1.5:23232',
    'ftp://localhost:21',
    'null',
    'not-a-url'
  ])('rejects non-local origin %s', origin => {
    expect(isAllowedOrigin(origin, [])).toBe(false);
  });

  it('allows origins from the explicit allowlist', () => {
    expect(isAllowedOrigin('http://192.168.1.5:23232', ['http://192.168.1.5:23232'])).toBe(true);
  });

  it('requires an exact match against the allowlist', () => {
    expect(isAllowedOrigin('http://192.168.1.5:9999', ['http://192.168.1.5:23232'])).toBe(false);
  });
});

describe('parseAllowedOrigins', () => {
  it('returns an empty list when unset', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
  });

  it('splits on commas and trims whitespace', () => {
    expect(parseAllowedOrigins(' http://192.168.1.5:23232 , http://10.0.0.2:23232'))
      .toEqual(['http://192.168.1.5:23232', 'http://10.0.0.2:23232']);
  });

  it('strips trailing slashes and empty segments', () => {
    expect(parseAllowedOrigins('http://192.168.1.5:23232/,,'))
      .toEqual(['http://192.168.1.5:23232']);
  });
});
