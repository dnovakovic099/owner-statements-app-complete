import { AxiosError } from 'axios';

export interface RetryStatus {
  attempt: number;
  isRetrying: boolean;
  message?: string;
}

export interface RetryOptions {
  maxWallTimeMs?: number;
  signal?: AbortSignal;
  onStatus?: (status: RetryStatus) => void;
  label?: string;
}

export class RetryCancelledError extends Error {
  constructor() {
    super('Cancelled by user');
    this.name = 'RetryCancelledError';
  }
}

export class RetryExhaustedError extends Error {
  readonly lastError: unknown;
  readonly attempts: number;
  constructor(lastError: unknown, attempts: number) {
    super(`Hostify did not respond after ${attempts} attempts. Try again later.`);
    this.name = 'RetryExhaustedError';
    this.lastError = lastError;
    this.attempts = attempts;
  }
}

const BACKOFF_SCHEDULE_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const DEFAULT_MAX_WALL_MS = 10 * 60 * 1000;

function isRetryableError(err: unknown): boolean {
  const axErr = err as AxiosError;
  if (!axErr.response) return true;
  const status = axErr.response.status;
  if (status === 401 || status === 403) return false;
  if (status >= 400 && status < 500 && status !== 429) return false;
  return true;
}

function sleepCancellable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetryCancelledError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RetryCancelledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function retryWithLoader<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxWallTimeMs = options.maxWallTimeMs ?? DEFAULT_MAX_WALL_MS;
  const startedAt = Date.now();
  let attempt = 1;

  while (true) {
    if (options.signal?.aborted) throw new RetryCancelledError();

    try {
      const result = await fn();
      if (attempt > 1) {
        options.onStatus?.({ attempt, isRetrying: false });
      }
      return result;
    } catch (err) {
      if (!isRetryableError(err)) throw err;

      const elapsed = Date.now() - startedAt;
      if (elapsed >= maxWallTimeMs) {
        throw new RetryExhaustedError(err, attempt);
      }

      const delayIdx = Math.min(attempt - 1, BACKOFF_SCHEDULE_MS.length - 1);
      const baseDelay = BACKOFF_SCHEDULE_MS[delayIdx];
      const actualDelay = Math.min(baseDelay, maxWallTimeMs - elapsed);

      const nextAttempt = attempt + 1;
      const labelPrefix = options.label ? `${options.label}: ` : '';
      options.onStatus?.({
        attempt: nextAttempt,
        isRetrying: true,
        message: `${labelPrefix}Hostify is slow, retrying… (attempt ${nextAttempt})`
      });

      await sleepCancellable(actualDelay, options.signal);
      attempt = nextAttempt;
    }
  }
}
