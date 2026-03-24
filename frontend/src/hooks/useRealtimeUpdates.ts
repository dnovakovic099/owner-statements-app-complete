import { useEffect, useRef, useState } from 'react';

interface SSEEvent {
  type: string;
  data: any;
}

// Shared EventSource singleton — avoids multiple SSE connections per tab
let sharedES: EventSource | null = null;
let sharedListeners: Set<(event: SSEEvent) => void> = new Set();
let sharedReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sharedConnected = false;

function getOrCreateEventSource() {
  if (sharedES && sharedES.readyState !== EventSource.CLOSED) return sharedES;

  let token = '';
  try {
    const stored = localStorage.getItem('luxury-lodging-auth');
    if (stored) token = JSON.parse(stored).token || '';
  } catch {}
  if (!token) return null;

  const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3003';
  const es = new EventSource(`${baseUrl}/api/events?token=${encodeURIComponent(token)}`);
  sharedES = es;

  es.addEventListener('connected', () => {
    sharedConnected = true;
  });

  const eventTypes = [
    'statement_updated', 'payout_completed', 'statement_generated',
    'version', 'notification_update',
  ];

  for (const type of eventTypes) {
    es.addEventListener(type, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        sharedListeners.forEach((listener) => {
          listener({ type, data });
        });
      } catch {}
    });
  }

  es.onerror = () => {
    sharedConnected = false;
    es.close();
    sharedES = null;
    if (sharedReconnectTimer) clearTimeout(sharedReconnectTimer);
    sharedReconnectTimer = setTimeout(getOrCreateEventSource, 5000);
  };

  return es;
}

export function useRealtimeUpdates(onEvent?: (event: SSEEvent) => void) {
  const [connected, setConnected] = useState(sharedConnected);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const listener = (event: SSEEvent) => {
      if (event.type === 'connected' || event.type === 'version') {
        setConnected(true);
      }
      callbackRef.current?.(event);
    };

    sharedListeners.add(listener);
    getOrCreateEventSource();

    return () => {
      sharedListeners.delete(listener);
      // Close connection only when no more listeners
      if (sharedListeners.size === 0 && sharedES) {
        sharedES.close();
        sharedES = null;
        if (sharedReconnectTimer) clearTimeout(sharedReconnectTimer);
      }
    };
  }, []);

  return { connected };
}
