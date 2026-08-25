export interface ApiError {
  message: string;
  /** The backend's stable error code (e.g. a `DockerErrorCode`), when it sent one. */
  code?: string;
}

/** Extracts the backend's `{ error, code }` from a failed response, or the fallback message. */
export async function readApiError(res: Response, fallback: string): Promise<ApiError> {
  try {
    const body = await res.json();
    return {
      message: body?.error || fallback,
      code: typeof body?.code === 'string' ? body.code : undefined,
    };
  } catch {
    return { message: fallback };
  }
}

/** Extracts the backend's `{ error }` message from a failed response, or the fallback. */
export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  return (await readApiError(res, fallback)).message;
}
