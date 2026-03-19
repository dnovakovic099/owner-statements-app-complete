import { useEffect, useRef, useState, useCallback } from 'react';

type NavigateFn = (page: string) => void;

const SEQUENCE_TIMEOUT = 800; // ms to wait for second key in a sequence

/**
 * Returns true when the active element is an input, textarea, select,
 * or any element with contentEditable — i.e., the user is typing.
 */
function isTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

const GO_TARGETS: Record<string, string> = {
  d: 'dashboard',
  l: 'listings',
  a: 'analytics',
  s: 'settings',
  p: 'wise',      // Payout Accounts page key
  e: 'email',
};

/**
 * Registers global keyboard shortcuts.
 *
 * Shortcuts:
 *   g then d/l/a/s/p/e  — navigate to a page
 *   / or Ctrl+K (Cmd+K) — focus search input
 *   ?                    — toggle shortcuts help modal
 *
 * @param navigate  Callback to change the current page (receives a Page key string).
 * @returns `{ showHelp, setShowHelp }` to control the help modal.
 */
export function useKeyboardShortcuts(navigate: NavigateFn) {
  const [showHelp, setShowHelp] = useState(false);

  // Track whether we're waiting for the second key in a "g then X" sequence.
  const pendingG = useRef(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    pendingG.current = false;
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Never intercept when typing in form fields.
      if (isTyping()) {
        clearPending();
        return;
      }

      const key = e.key.toLowerCase();
      const modKey = e.metaKey || e.ctrlKey;

      // --- Ctrl/Cmd+K  — focus search ---
      if (modKey && key === 'k') {
        e.preventDefault();
        focusSearch();
        clearPending();
        return;
      }

      // Ignore any other combo that involves Ctrl/Cmd/Alt so we don't
      // swallow browser shortcuts.
      if (modKey || e.altKey) return;

      // --- "g then X" sequence ---
      if (pendingG.current) {
        clearPending();
        const target = GO_TARGETS[key];
        if (target) {
          e.preventDefault();
          navigate(target);
        }
        return;
      }

      // Start "g" sequence
      if (key === 'g') {
        pendingG.current = true;
        pendingTimer.current = setTimeout(clearPending, SEQUENCE_TIMEOUT);
        return;
      }

      // --- "/" — focus search ---
      if (key === '/') {
        e.preventDefault();
        focusSearch();
        return;
      }

      // --- "?" — toggle help ---
      if (e.key === '?') {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearPending();
    };
  }, [navigate, clearPending]);

  return { showHelp, setShowHelp };
}

/** Tries to find and focus a search input on the page. */
function focusSearch() {
  const el =
    document.querySelector<HTMLInputElement>('input[type="search"]') ||
    document.querySelector<HTMLInputElement>('input[placeholder*="Search"]');
  if (el) {
    el.focus();
    el.select();
  }
}
