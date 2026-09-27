/**
 * @citeroute/edge - Telemetry Dispatcher
 * ──────────────────────────────────────
 * Non-blocking, fail-open telemetry reporter that forwards crawler and agent
 * traffic events to the CiteRoute knowledge core.
 */

import { TelemetryPayload } from './types';

const DEFAULT_ENDPOINT = 'https://www.citeroute.com/api/v1/track';

// In-memory LRU burst throttle for high-frequency crawlers
const recentEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 2000;

function isBurstThrottled(key: string): boolean {
  const now = Date.now();
  const lastTime = recentEvents.get(key);

  if (lastTime && now - lastTime < DEDUP_WINDOW_MS) {
    return true;
  }

  recentEvents.set(key, now);

  // Clean old entries if map grows
  if (recentEvents.size > 200) {
    for (const [k, time] of recentEvents.entries()) {
      if (now - time > DEDUP_WINDOW_MS) {
        recentEvents.delete(k);
      }
    }
  }

  return false;
}

/**
 * Sends a telemetry event to CiteRoute without blocking the edge response.
 */
export async function dispatchTelemetry(
  payload: TelemetryPayload,
  config: { endpoint?: string; apiKey?: string; debug?: boolean }
): Promise<void> {
  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  const dedupKey = `${payload.domain}:${payload.source}:${payload.path}`;

  if (isBurstThrottled(dedupKey)) {
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-citeroute-proxy': '1',
    'x-omniroute-proxy': '1',
  };

  if (payload.userAgent) {
    headers['x-forwarded-user-agent'] = payload.userAgent;
  }
  if (payload.referer) {
    headers['x-forwarded-referer'] = payload.referer;
  }
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const body = JSON.stringify({
    domain: payload.domain,
    path: payload.path,
    type: payload.type,
    source: payload.source,
    intent: payload.intent || `${payload.source} ${payload.optimized ? 'optimized crawl' : 'request'}`,
    destinationUrl: payload.destinationUrl,
    pageReferrer: payload.referer,
  });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    });

    if (config.debug) {
      console.log(`[CiteRoute Edge] Telemetry dispatched: ${payload.source} -> ${payload.domain}${payload.path} (${res.status})`);
    }
  } catch (err) {
    // Fail-open: Never disrupt the customer's site response
    if (config.debug) {
      console.warn('[CiteRoute Edge] Telemetry report failed (non-blocking):', err);
    }
  }
}
