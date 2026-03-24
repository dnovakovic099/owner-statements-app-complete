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
let consecutiveErrors = 0;
const MAX_RETRIES = 3;
const BACKOFF_BASE = 5000; // 5s, 10s, 20s

function getOrCreateEventSource() {
  if (sharedES && sharedES.readyState !== EventSource.CLOSED) return sharedES;
  if (consecutiveErrors >= MAX_RETRIES) return null; // Stop retrying after repeated failures

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
    consecutiveErrors = 0; // Reset on successful connection
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
    consecutiveErrors++;

    if (consecutiveErrors < MAX_RETRIES) {
      const delay = BACKOFF_BASE * Math.pow(2, consecutiveErrors - 1);
      if (sharedReconnectTimer) clearTimeout(sharedReconnectTimer);
      sharedReconnectTimer = setTimeout(getOrCreateEventSource, delay);
    }
    // After MAX_RETRIES, stop trying — avoids 401 loop
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
      if (sharedListeners.size === 0 && sharedES) {
        sharedES.close();
        sharedES = null;
        if (sharedReconnectTimer) clearTimeout(sharedReconnectTimer);
      }
    };
  }, []);

  return { connected };
}
