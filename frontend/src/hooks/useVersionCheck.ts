import { useEffect, useRef, useState, useCallback } from 'react';
import { useRealtimeUpdates } from './useRealtimeUpdates';

const FALLBACK_INTERVAL = 5 * 60_000; // Fallback poll every 5 minutes (was 60s)

/**
 * Detects new deploys via SSE `version` event, with a long-interval fallback poll.
 * Returns { updateAvailable, refresh } so the caller can render UI.
 */
export function useVersionCheck() {
  const currentVersion = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const refresh = useCallback(() => {
    window.location.reload();
  }, []);

  // Listen for SSE version events
  useRealtimeUpdates(useCallback((event: { type: string; data: any }) => {
    if (event.type === 'version' && event.data?.v) {
      const serverVersion = event.data.v;
      if (currentVersion.current === null) {
        currentVersion.current = serverVersion;
      } else if (serverVersion !== currentVersion.current) {
        setUpdateAvailable(true);
      }
    }
  }, []));

  // Fallback: poll /version.json infrequently + on tab focus
  useEffect(() => {
    async function checkVersion() {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const serverVersion = data.v;
        if (!serverVersion) return;

        if (currentVersion.current === null) {
          currentVersion.current = serverVersion;
        } else if (serverVersion !== currentVersion.current) {
          setUpdateAvailable(true);
        }
      } catch {
        // Silently ignore
      }
    }

    checkVersion();
    const timer = setInterval(checkVersion, FALLBACK_INTERVAL);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return { updateAvailable, refresh };
}
