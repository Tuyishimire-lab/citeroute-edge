/**
 * @citeroute/edge - Next.js Adapter
 * ─────────────────────────────────
 * Drop-in middleware for Next.js 14, 15, and 16 (App Router & Pages Router).
 */

import { CiteRouteEdgeConfig } from '../types';
import { classifyEdgeRequest } from '../classifier';
import { dispatchTelemetry } from '../telemetry';
import { buildDefaultAgentManifest, buildDefaultLlmsTxt } from '../optimizer';

// Generic Next.js Edge Request / Response types (avoids hard dependency on next/server)
export interface NextRequestLike extends Request {
  nextUrl: URL;
  ip?: string;
}

export interface NextFetchEventLike {
  waitUntil: (promise: Promise<unknown>) => void;
}

export interface NextResponseLike extends Response {
  headers: Headers;
}

/**
 * Creates a Next.js middleware function.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { createNextMiddleware } from '@citeroute/edge/next';
 *
 * export const middleware = createNextMiddleware({
 *   domain: 'acme.com',
 *   apiKey: process.env.CITEROUTE_API_KEY,
 *   optimizeForBots: true,
 * });
 * ```
 */
export function createNextMiddleware(config: CiteRouteEdgeConfig) {
  const manifestPath = config.manifestPath || '/.well-known/agent.json';
  const llmsTxtPath = config.llmsTxtPath || '/llms.txt';

  return async function citerouteMiddleware(
    req: NextRequestLike,
    event?: NextFetchEventLike
  ): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const ua = req.headers.get('user-agent');
    const referer = req.headers.get('referer');

    // 1. Check ignore paths
    if (config.ignorePaths) {
      for (const pattern of config.ignorePaths) {
        if (typeof pattern === 'string' && pathname.startsWith(pattern)) {
          return new Response(null, { headers: { 'x-citeroute-tracked': '1' } });
        } else if (pattern instanceof RegExp && pattern.test(pathname)) {
          return new Response(null, { headers: { 'x-citeroute-tracked': '1' } });
        }
      }
    }

    // 2. Classify request
    const bot = classifyEdgeRequest(ua, referer);

    // 3. Serve .well-known/agent.json directly if requested
    if (pathname === manifestPath) {
      const manifest = config.manifest || buildDefaultAgentManifest(config.domain);
      const manifestJson = JSON.stringify(manifest, null, 2);

      const telePromise = dispatchTelemetry(
        {
          domain: config.domain,
          path: pathname,
          type: bot.isBot ? bot.eventType : 'GEO_INDEX_PING',
          source: bot.name || 'Agent Discovery Bot',
          userAgent: ua || undefined,
          referer,
          destinationUrl: req.url,
          optimized: true,
        },
        config
      );

      if (event?.waitUntil) {
        event.waitUntil(telePromise);
      } else {
        telePromise.catch(() => {});
      }

      return new Response(manifestJson, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
          'X-CiteRoute-Protocol': 'agent-v1.2',
          'X-CiteRoute-Tracked': '1',
        },
      });
    }

    // 4. Serve /llms.txt directly if requested
    if (pathname === llmsTxtPath) {
      const llmsContent = config.llmsTxt || buildDefaultLlmsTxt(config.domain);

      const telePromise = dispatchTelemetry(
        {
          domain: config.domain,
          path: pathname,
          type: 'GEO_INDEX_PING',
          source: bot.name || 'LLM Indexer',
          userAgent: ua || undefined,
          referer,
          destinationUrl: req.url,
          optimized: true,
        },
        config
      );

      if (event?.waitUntil) {
        event.waitUntil(telePromise);
      } else {
        telePromise.catch(() => {});
      }

      return new Response(llmsContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
          'X-CiteRoute-Protocol': 'llms-txt-v1',
          'X-CiteRoute-Tracked': '1',
        },
      });
    }

    // 5. Bot hook and asynchronous telemetry dispatch
    if (bot.isBot) {
      if (config.onBotDetected) {
        try {
          await config.onBotDetected(bot, req);
        } catch (e) {
          if (config.debug) console.warn('[CiteRoute] onBotDetected callback error:', e);
        }
      }

      const telePromise = dispatchTelemetry(
        {
          domain: config.domain,
          path: pathname + url.search,
          type: bot.eventType,
          source: bot.name || 'AI Bot',
          userAgent: ua || undefined,
          referer,
          destinationUrl: req.url,
          optimized: !!config.optimizeForBots,
        },
        config
      );

      if (event?.waitUntil) {
        event.waitUntil(telePromise);
      } else {
        telePromise.catch(() => {});
      }
    }

    // Pass through to Next.js route with identification header
    // In Next.js middleware, returning a response with headers continues the chain
    const headers = new Headers();
    headers.set('x-citeroute-tracked', '1');
    if (bot.isBot && bot.name) {
      headers.set('x-citeroute-bot', bot.name);
    }

    return new Response(null, { headers });
  };
}
