const MAX_REFERENCE_LENGTH = 512;

// Grammar from the Docker distribution reference spec, simplified to what the
// engine accepts for `docker create`: [registry[:port]/]path[:tag][@digest].
const PATH_COMPONENT = '[a-z0-9]+(?:(?:\\.|_|__|-+)[a-z0-9]+)*';
const DOMAIN = '(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?';
const REGISTRY = `(?:${DOMAIN}|localhost)(?::[0-9]{1,5})?`;
const NAME = `(?:${REGISTRY}/)?${PATH_COMPONENT}(?:/${PATH_COMPONENT})*`;
const TAG = ':[\\w][\\w.-]{0,127}';
const DIGEST = '@sha256:[a-f0-9]{64}';

const IMAGE_REFERENCE_REGEX = new RegExp(`^${NAME}(?:${TAG})?(?:${DIGEST})?$`);

export function isValidImageReference(ref: string): boolean {
  if (typeof ref !== 'string' || ref.length === 0 || ref.length > MAX_REFERENCE_LENGTH) {
    return false;
  }
  return IMAGE_REFERENCE_REGEX.test(ref);
}

export class InvalidImageReferenceError extends Error {
  public readonly code = 'INVALID_IMAGE_REFERENCE';

  constructor(ref: string) {
    super(`Invalid Docker image reference: "${ref}".`);
    this.name = 'InvalidImageReferenceError';
  }
}
