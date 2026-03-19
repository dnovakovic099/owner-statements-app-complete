import { useEffect, useRef } from 'react';

const CHECK_INTERVAL = 60_000; // Check every 60 seconds

/**
 * Polls /version.json and auto-reloads the page when a new deploy is detected.
 * The version.json file is regenerated on every build with a unique timestamp hash.
 */
export function useVersionCheck() {
  const currentVersion = useRef<string | null>(null);
  const hasReloaded = useRef(false);

  useEffect(() => {
    async function checkVersion() {
      try {
        // Bypass cache to get the latest version.json
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const serverVersion = data.v;

        if (!serverVersion) return;

        if (currentVersion.current === null) {
          // First check — store the current version
          currentVersion.current = serverVersion;
        } else if (serverVersion !== currentVersion.current && !hasReloaded.current) {
          // Version changed — new deploy detected
          hasReloaded.current = true;
          console.log(`[VersionCheck] New deploy detected (${currentVersion.current} → ${serverVersion}). Reloading...`);
          window.location.reload();
        }
      } catch {
        // Silently ignore fetch errors (offline, etc.)
      }
    }

    // Initial check
    checkVersion();

    // Poll on interval
    const timer = setInterval(checkVersion, CHECK_INTERVAL);

    // Also check when tab becomes visible (user returns to the app)
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
}
