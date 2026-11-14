import { useEffect, useRef, useState } from "react";

/**
 * Form state that survives a page reload for *new* documents (the old pages kept
 * work-in-progress in localStorage too). Editing an existing record never uses a draft.
 */
export function useDraft<T>(key: string | null, initial: () => T): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const storageKey = key ? `epm-draft:${key}` : null;
  const [state, setState] = useState<T>(() => {
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return { ...initial(), ...JSON.parse(raw) } as T;
      } catch {
        /* ignore corrupt / unavailable storage */
      }
    }
    return initial();
  });
  const first = useRef(true);
  useEffect(() => {
    if (!storageKey) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        /* storage full or blocked — draft just won't persist */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state, storageKey]);
  const clear = () => {
    if (!storageKey) return;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* noop */
    }
  };
  return [state, setState, clear];
}
