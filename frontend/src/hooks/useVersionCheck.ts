import { useEffect, useRef, useState, useCallback } from 'react';

const CHECK_INTERVAL = 60_000; // Check every 60 seconds

/**
 * Polls /version.json and shows a non-disruptive banner when a new deploy is detected.
 * Returns { updateAvailable, refresh } so the caller can render UI.
 */
export function useVersionCheck() {
  const currentVersion = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const refresh = useCallback(() => {
    window.location.reload();
  }, []);

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
    const timer = setInterval(checkVersion, CHECK_INTERVAL);

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
