import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export function useCopy(resetMs = 2500) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (text: string, message: string, key = 'default') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedKey(null), resetMs);
      toast.success(message);
      return true;
    } catch {
      toast.error('Não foi possível copiar o link.');
      return false;
    }
  };

  return { copiedKey, copy };
}
