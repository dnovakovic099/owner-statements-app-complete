import { useEffect, useRef, useState, useCallback } from 'react';
import { useRealtimeUpdates } from './useRealtimeUpdates';

/**
 * Detects new deploys via SSE `version` event.
 * Only fetches /version.json once on mount to seed the baseline.
 * After that, relies entirely on SSE + tab-refocus check.
 */
export function useVersionCheck() {
  const currentVersion = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const refresh = useCallback(() => {
    window.location.reload();
  }, []);

  const handleVersion = useCallback((v: string) => {
    if (!v) return;
    if (currentVersion.current === null) {
      currentVersion.current = v;
    } else if (v !== currentVersion.current) {
      setUpdateAvailable(true);
    }
  }, []);

  // Listen for SSE version events (pushed on connect + on deploy)
  useRealtimeUpdates(useCallback((event: { type: string; data: any }) => {
    if (event.type === 'version' && event.data?.v) {
      handleVersion(event.data.v);
    }
  }, [handleVersion]));

  // Seed baseline version once on mount + check on tab refocus (no interval)
  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.v) handleVersion(data.v);
      } catch {
        // Silently ignore
      }
    }

    // One-time seed — SSE handles all updates after this
    if (currentVersion.current === null) {
      checkVersion();
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [handleVersion]);

  return { updateAvailable, refresh };
}
