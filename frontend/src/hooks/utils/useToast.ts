import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseToastOptions {
  durationMs?: number;
}

export interface UseToastReturn {
  toast: string | null;
  showToast: (message: string) => void;
  clear: () => void;
}

export function useToast(options: UseToastOptions = {}): UseToastReturn {
  const { durationMs = 2000 } = options;
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      setToast(message);
      timerRef.current = setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { toast, showToast, clear };
}
