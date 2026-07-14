import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Fetches a DB inspector's explorer endpoint. While the container is still
 * warming up the backend answers with a "starting up" error: the hook exposes
 * the 'starting_up' sentinel as `error` and auto-retries every 2.5s. Pending
 * retries are cleared before re-arming (overlapping auto/manual triggers never
 * stack) and on unmount.
 */
export function useExplorerData<T>(url: string, fallbackError: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRef = useRef<() => Promise<void>>(undefined);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(url);
      if (res.ok) {
        const responseData = await res.json();
        setData(responseData);
      } else {
        const errData = await res.json();
        if (errData.error && errData.error.includes('starting up')) {
          setError('starting_up');
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            fetchRef.current?.();
          }, 2500);
        } else {
          setError(errData.error || fallbackError);
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect to container';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, [url, fallbackError]);

  useEffect(() => {
    fetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    refetch();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [refetch]);

  return { data, loading, error, refetch };
}
