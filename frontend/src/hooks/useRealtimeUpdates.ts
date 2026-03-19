import { useEffect, useRef, useCallback, useState } from 'react';

interface SSEEvent {
  type: string;
  data: any;
}

export function useRealtimeUpdates(onEvent?: (event: SSEEvent) => void) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    // Get auth token
    let token = '';
    try {
      const stored = localStorage.getItem('luxury-lodging-auth');
      if (stored) token = JSON.parse(stored).token || '';
    } catch {}

    if (!token) return;

    const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3003';
    const es = new EventSource(`${baseUrl}/api/events?token=${encodeURIComponent(token)}`);
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setConnected(true);
    });

    es.addEventListener('statement_updated', (e) => {
      const data = JSON.parse(e.data);
      onEvent?.({ type: 'statement_updated', data });
    });

    es.addEventListener('payout_completed', (e) => {
      const data = JSON.parse(e.data);
      onEvent?.({ type: 'payout_completed', data });
    });

    es.addEventListener('statement_generated', (e) => {
      const data = JSON.parse(e.data);
      onEvent?.({ type: 'statement_generated', data });
    });

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 5 seconds
      reconnectTimer.current = setTimeout(connect, 5000);
    };
  }, [onEvent]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { connected };
}
