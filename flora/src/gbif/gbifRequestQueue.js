/** Общая очередь запросов к api.gbif.org: лимит параллелизма и пауза после 429/503. */

/** GBIF анонимно режет параллельные occurrence/search (429). Одна очередь на всё приложение. */
const MAX_CONCURRENT = 1;
const MIN_INTERVAL_MS = 400;
const FETCH_TIMEOUT_MS = 20000;

let active = 0;
let lastStartedAt = 0;
let pauseUntil = 0;
const waiters = [];

function createAbortError() {
  const abortError = new Error("Aborted");
  abortError.name = "AbortError";
  return abortError;
}

function waitMs(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function parseGbifRetryAfterMs(response) {
  const raw = response?.headers?.get?.("Retry-After");
  if (!raw) {
    return null;
  }

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return null;
}

export function notifyGbifRateLimit(retryAfterMs = 5000) {
  const wait = Math.max(2000, Number(retryAfterMs) || 5000);
  pauseUntil = Math.max(pauseUntil, Date.now() + wait);
}

function pump() {
  while (waiters.length > 0 && active < MAX_CONCURRENT) {
    const next = waiters.shift();
    next();
  }
}

async function acquire(signal) {
  await new Promise((resolve, reject) => {
    let settled = false;

    const tryEnter = () => {
      if (settled) {
        return;
      }
      if (signal?.aborted) {
        settled = true;
        reject(createAbortError());
        return;
      }
      if (active >= MAX_CONCURRENT) {
        if (!waiters.includes(tryEnter)) {
          waiters.push(tryEnter);
        }
        return;
      }
      settled = true;
      active += 1;
      resolve();
    };

    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      const index = waiters.indexOf(tryEnter);
      if (index >= 0) {
        waiters.splice(index, 1);
      }
      reject(createAbortError());
      pump();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    tryEnter();
  });

  try {
    // Пересчитываем паузу после sleep: иначе несколько waiter'ов стартуют в один тик.
    while (true) {
      const now = Date.now();
      const until = Math.max(pauseUntil, lastStartedAt + MIN_INTERVAL_MS);
      const delay = until - now;
      if (delay <= 0) {
        break;
      }
      await waitMs(delay, signal);
    }
    lastStartedAt = Date.now();
  } catch (error) {
    active -= 1;
    pump();
    throw error;
  }
}

function release() {
  active = Math.max(0, active - 1);
  pump();
}

function withTimeoutSignal(signal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => {
    clearTimeout(timer);
    controller.abort();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const cleanup = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  };
  return { signal: controller.signal, cleanup };
}

/**
 * fetch через общую очередь GBIF. При 429/503 ставит очередь на паузу.
 */
export async function gbifFetch(url, { signal, ...init } = {}) {
  await acquire(signal);
  const timed = withTimeoutSignal(signal, FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: timed.signal,
      mode: "cors",
      credentials: "omit"
    });
    if (response.status === 429 || response.status === 503) {
      notifyGbifRateLimit(parseGbifRetryAfterMs(response) ?? 5000);
    }
    return response;
  } catch (error) {
    if (timed.signal.aborted && !signal?.aborted) {
      const timeoutError = new Error("GBIF request timeout");
      timeoutError.status = 503;
      throw timeoutError;
    }
    throw error;
  } finally {
    timed.cleanup();
    release();
  }
}
