import { useState, useCallback } from 'react';

export interface NotificationData {
  type: 'error' | 'warning' | 'success';
  message: string;
}

export function useToast() {
  const [toast, setToast] = useState<NotificationData | null>(null);

  const showNotification = useCallback(({ type, message }: NotificationData, duration = 4000) => {
    setToast({ type, message });
    const timer = setTimeout(() => setToast(null), duration);
    return () => clearTimeout(timer);
  }, []);

  // A convenience wrapper for the common case: a positive confirmation toast.
  // The severity is passed explicitly (default 'success') rather than inferred
  // from the message text — the old keyword sniffing broke the moment messages
  // were translated (a French "échec" is not "failed"). Callers that need a
  // different severity pass it, or use showNotification directly.
  const showToast = useCallback(
    (message: string, type: 'error' | 'warning' | 'success' = 'success', duration = 4000) => {
      setToast({ type, message });
      const timer = setTimeout(() => setToast(null), duration);
      return () => clearTimeout(timer);
    },
    []
  );

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, showNotification, showToast, dismissToast };
}
