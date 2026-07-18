import { Response } from 'express';

export type DockerErrorCode =
  | 'DOCKER_UNAVAILABLE'
  | 'IMAGE_NOT_FOUND'
  | 'PORT_IN_USE'
  | 'NAME_CONFLICT'
  | 'CONTAINER_NOT_FOUND'
  | 'DOCKER_ERROR';

export interface ClassifiedDockerError {
  code: DockerErrorCode;
  httpStatus: number;
  userMessage: string;
}

interface DockerErrorLike {
  code?: string;
  syscall?: string;
  statusCode?: number;
  message?: string;
}

/**
 * Thrown when a container id/name does not exist OR belongs to another
 * project. Both cases map to the exact same 404 payload as
 * CONTAINER_NOT_FOUND so a caller cannot probe for a container's existence.
 */
export class ContainerNotFoundError extends Error {
  constructor(containerId: string) {
    super(`No such container: ${containerId}`);
    this.name = 'ContainerNotFoundError';
  }
}

/**
 * Maps a raw error from dockerode (or a service layer above it) to a stable
 * error code, an HTTP status and a user-facing message.
 *
 * Message patterns are checked before `statusCode`: pull failures surfaced by
 * `docker.modem.followProgress` often carry no statusCode at all, and port
 * conflicts are reported by the Docker Engine as a generic 500.
 */
export function classifyDockerError(err: unknown, context?: string): ClassifiedDockerError {
  if (err instanceof ContainerNotFoundError) {
    return {
      code: 'CONTAINER_NOT_FOUND',
      httpStatus: 404,
      userMessage: 'This container no longer exists in Docker. Refresh the canvas.',
    };
  }

  const e = (err ?? {}) as DockerErrorLike;
  const message = e.message ?? '';

  const daemonUnreachable =
    e.code === 'ECONNREFUSED' ||
    e.code === 'EPIPE' ||
    // ENOENT/EACCES are daemon signals only when they come from connecting to
    // the Docker socket ("connect ENOENT /var/run/docker.sock"), not from
    // arbitrary fs errors (whose syscall is open/stat/...).
    ((e.code === 'ENOENT' || e.code === 'EACCES') &&
      (e.syscall === 'connect' || /docker/i.test(message)));
  if (daemonUnreachable) {
    return {
      code: 'DOCKER_UNAVAILABLE',
      httpStatus: 503,
      userMessage: 'Cannot reach the Docker daemon. Make sure Docker is running on your machine, then retry.',
    };
  }

  if (/no such image|manifest unknown|pull access denied|repository .* not found/i.test(message)) {
    return {
      code: 'IMAGE_NOT_FOUND',
      httpStatus: 502,
      userMessage: 'The Docker image for this node could not be found or downloaded. Check your internet connection — the image is pulled from Docker Hub on first use.',
    };
  }

  if (/port is already allocated|address already in use/i.test(message)) {
    return {
      code: 'PORT_IN_USE',
      httpStatus: 409,
      userMessage: 'A port this container needs is already taken on your machine. Stop the application using it, then try again.',
    };
  }

  if (e.statusCode === 409) {
    return {
      code: 'NAME_CONFLICT',
      httpStatus: 409,
      userMessage: 'A container with this name already exists. Pick a different name or delete the existing one.',
    };
  }

  if (e.statusCode === 404 && /no such container/i.test(message)) {
    return {
      code: 'CONTAINER_NOT_FOUND',
      httpStatus: 404,
      userMessage: 'This container no longer exists in Docker. Refresh the canvas.',
    };
  }

  // A statusCode means the error comes from the Docker Engine API: its raw
  // message is not fit for end users. Errors thrown by our own services carry
  // no statusCode and their message is already user-facing — pass it through.
  const genericMessage = `Something went wrong in Docker while ${context ?? 'performing this operation'}. Details were logged on the server.`;
  return {
    code: 'DOCKER_ERROR',
    httpStatus: 500,
    userMessage: typeof e.statusCode === 'number' || !message ? genericMessage : message,
  };
}

/**
 * Standard error response for container routes: logs the raw error server-side
 * and answers `{ error: <user message>, code: <DockerErrorCode> }`.
 *
 * Docker replies 304 when starting an already-running (or stopping an
 * already-stopped) container — a harmless no-op, e.g. on a double-click —
 * so it is answered as a success instead of an error.
 */
export function sendDockerError(res: Response, err: unknown, context?: string): void {
  if ((err as DockerErrorLike)?.statusCode === 304) {
    res.json({ success: true });
    return;
  }
  const { code, httpStatus, userMessage } = classifyDockerError(err, context);
  console.error(`[docker] Error while ${context ?? 'handling request'}:`, err);
  res.status(httpStatus).json({ error: userMessage, code });
}
