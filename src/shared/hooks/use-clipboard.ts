'use client';

import * as React from 'react';

export interface UseClipboardOptions {
  timeout?: number;
  onCopy?: () => void;
}

export function useClipboard({
  timeout = 2000,
  onCopy,
}: UseClipboardOptions = {}) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = React.useCallback(
    async (text: string): Promise<boolean> => {
      if (!text || typeof window === 'undefined') return false;

      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        onCopy?.();

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          setCopied(false);
          timeoutRef.current = null;
        }, timeout);

        return true;
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        return false;
      }
    },
    [timeout, onCopy]
  );

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { copied, copy };
}
