import { useRef, useState, useCallback } from 'react';
import { useRealtimeUpdates } from './useRealtimeUpdates';

/**
 * Detects new deploys via SSE `version` event.
 * No polling, no fetching — relies entirely on SSE pushing the version on connect.
 */
export function useVersionCheck() {
  const currentVersion = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const refresh = useCallback(() => {
    window.location.reload();
  }, []);

  // Listen for SSE version events (pushed on connect + on deploy)
  useRealtimeUpdates(useCallback((event: { type: string; data: any }) => {
    if (event.type === 'version' && event.data?.v) {
      const v = event.data.v;
      if (currentVersion.current === null) {
        currentVersion.current = v;
      } else if (v !== currentVersion.current) {
        setUpdateAvailable(true);
      }
    }
  }, []));

  return { updateAvailable, refresh };
}
