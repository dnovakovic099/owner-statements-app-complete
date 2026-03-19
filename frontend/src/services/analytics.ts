/**
 * Lightweight internal analytics service.
 *
 * Tracks page views and feature usage, batching events and flushing them
 * to the backend every 30 seconds (or on page unload via sendBeacon).
 *
 * Usage:
 *   import { analytics } from '../services/analytics';
 *   analytics.trackPageView('dashboard');
 *   analytics.trackFeatureUsage('statement_generation', { count: 5 });
 *   analytics.trackAction('filter_change', 'statements', 'status=draft');
 */

interface AnalyticsEvent {
  type: 'page_view' | 'feature_usage' | 'action';
  name: string;
  category?: string;
  label?: string;
  metadata?: Record<string, any>;
  timestamp: string;
  sessionId: string;
  userId: string | null;
}

const FLUSH_INTERVAL_MS = 30_000;
const API_BASE_URL =
  process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3003/api';
const ENDPOINT = `${API_BASE_URL}/analytics/events`;

function generateSessionId(): string {
  // crypto.randomUUID is available in all modern browsers; fall back to a
  // simple random string in older environments.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getUserId(): string | null {
  try {
    const stored = localStorage.getItem('luxury-lodging-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.username ?? parsed.userId ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem('luxury-lodging-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

class AnalyticsService {
  private queue: AnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;

  constructor() {
    this.sessionId = generateSessionId();
    this.startFlushTimer();
    this.registerUnloadHandler();
  }

  // ---- Public API ----

  trackPageView(page: string): void {
    this.enqueue({
      type: 'page_view',
      name: page,
    });
  }

  trackFeatureUsage(feature: string, metadata?: Record<string, any>): void {
    this.enqueue({
      type: 'feature_usage',
      name: feature,
      metadata,
    });
  }

  trackAction(action: string, category: string, label?: string): void {
    this.enqueue({
      type: 'action',
      name: action,
      category,
      label,
    });
  }

  // ---- Internals ----

  private enqueue(partial: Omit<AnalyticsEvent, 'timestamp' | 'sessionId' | 'userId'>): void {
    this.queue.push({
      ...partial,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: getUserId(),
    });
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  private registerUnloadHandler(): void {
    if (typeof window === 'undefined') return;

    const onUnload = () => {
      if (this.queue.length === 0) return;

      const payload = JSON.stringify({ events: this.queue });
      this.queue = [];

      // sendBeacon is fire-and-forget and survives page unload.
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT, blob);
      }
    };

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        onUnload();
      }
    });
    window.addEventListener('pagehide', onUnload);
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      await fetch(ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({ events }),
        keepalive: true,
      });
    } catch {
      // Gracefully swallow errors -- analytics must never disrupt the user.
    }
  }
}

/** Singleton instance -- import this from other modules. */
export const analytics = new AnalyticsService();
