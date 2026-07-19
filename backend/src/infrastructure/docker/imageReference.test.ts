import { isValidImageReference, InvalidImageReferenceError } from './imageReference';

describe('isValidImageReference', () => {
  const validReferences = [
    'ubuntu',
    'ubuntu:latest',
    'ubuntu:20.04',
    'redis:7-alpine',
    'library/ubuntu:20.04',
    'a/b/c:1',
    'akal-lab-project-my-project-asg-asg-1-image:latest',
    'ghcr.io/org/app:v1.2.3',
    'registry.example.com:5000/team/app:v1.2.3',
    'localhost:5000/app',
    'ubuntu@sha256:' + 'a'.repeat(64),
    'ubuntu:latest@sha256:' + 'a'.repeat(64),
    'some__image.name-1',
  ];

  it.each(validReferences)('accepts %s', ref => {
    expect(isValidImageReference(ref)).toBe(true);
  });

  const invalidReferences: [string, string][] = [
    ['empty string', ''],
    ['uppercase repository', 'Ubuntu:latest'],
    ['whitespace', 'ubuntu latest'],
    ['empty tag', 'ubuntu:'],
    ['tag starting with dash', 'ubuntu:-bad'],
    ['double dots', 'foo..bar'],
    ['double slash', 'foo//bar'],
    ['leading dash', '-leading'],
    ['shell injection attempt', 'ubuntu:$(rm -rf /)'],
    ['embedded newline', 'ubuntu\n:latest'],
    ['bad digest', 'ubuntu@sha256:xyz'],
    ['overlong reference', 'a'.repeat(600)],
  ];

  it.each(invalidReferences)('rejects %s', (_label, ref) => {
    expect(isValidImageReference(ref)).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidImageReference(undefined as unknown as string)).toBe(false);
    expect(isValidImageReference(42 as unknown as string)).toBe(false);
  });
});

describe('InvalidImageReferenceError', () => {
  it('carries the classification code and the offending reference', () => {
    const err = new InvalidImageReferenceError('bad image');
    expect(err.code).toBe('INVALID_IMAGE_REFERENCE');
    expect(err.message).toContain('bad image');
    expect(err).toBeInstanceOf(Error);
  });
});
