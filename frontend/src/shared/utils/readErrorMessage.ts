/** Extracts the backend's `{ error }` message from a failed response, or the fallback. */
export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}
