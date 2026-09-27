/**
 * @citeroute/edge - Cloudflare Workers & Pages Adapter
 * ────────────────────────────────────────────────────
 * Universal Edge Proxy: Runs globally on Cloudflare edge in <5ms.
 * Captures raw AI bots, actively optimizes HTML responses into clean
 * semantic Markdown for search models, and serves agent manifests.
 */

import { CiteRouteEdgeConfig } from '../types';
import { classifyEdgeRequest } from '../classifier';
import { dispatchTelemetry } from '../telemetry';
import {
  transformHtmlForAiCrawler,
  buildDefaultAgentManifest,
  buildDefaultLlmsTxt,
} from '../optimizer';

export interface CloudflareExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException?: () => void;
}

/**
 * Creates a Cloudflare Worker fetch handler.
 *
 * @example
 * ```ts
 * // worker.ts
 * import { createCloudflareHandler } from '@citeroute/edge/cloudflare';
 *
 * export default createCloudflareHandler({
 *   domain: 'acme.com',
 *   apiKey: 'cr-live_12345678',
 *   optimizeForBots: true,
 * });
 * ```
 */
export function createCloudflareHandler(config: CiteRouteEdgeConfig) {
  const manifestPath = config.manifestPath || '/.well-known/agent.json';
  const llmsTxtPath = config.llmsTxtPath || '/llms.txt';

  return {
    async fetch(
      request: Request,
      env?: Record<string, unknown>,
      ctx?: CloudflareExecutionContext
    ): Promise<Response> {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const ua = request.headers.get('user-agent');
      const referer = request.headers.get('referer');

      // 1. Route: /.well-known/agent.json
      if (pathname === manifestPath) {
        const manifest = config.manifest || buildDefaultAgentManifest(config.domain);
        const manifestJson = JSON.stringify(manifest, null, 2);

        const bot = classifyEdgeRequest(ua, referer);
        const telePromise = dispatchTelemetry(
          {
            domain: config.domain,
            path: pathname,
            type: bot.isBot ? bot.eventType : 'GEO_INDEX_PING',
            source: bot.name || 'Agent Discovery Bot',
            userAgent: ua || undefined,
            referer,
            destinationUrl: request.url,
            optimized: true,
          },
          config
        );

        if (ctx?.waitUntil) ctx.waitUntil(telePromise);

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

      // 2. Route: /llms.txt
      if (pathname === llmsTxtPath) {
        const llmsContent = config.llmsTxt || buildDefaultLlmsTxt(config.domain);
        const bot = classifyEdgeRequest(ua, referer);

        const telePromise = dispatchTelemetry(
          {
            domain: config.domain,
            path: pathname,
            type: 'GEO_INDEX_PING',
            source: bot.name || 'LLM Indexer',
            userAgent: ua || undefined,
            referer,
            destinationUrl: request.url,
            optimized: true,
          },
          config
        );

        if (ctx?.waitUntil) ctx.waitUntil(telePromise);

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

      // 3. Classify Request
      const bot = classifyEdgeRequest(ua, referer);

      // Async telemetry
      if (bot.isBot) {
        if (config.onBotDetected) {
          try {
            await config.onBotDetected(bot, request);
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
            destinationUrl: request.url,
            optimized: !!config.optimizeForBots,
          },
          config
        );

        if (ctx?.waitUntil) ctx.waitUntil(telePromise);
      }

      // 4. Fetch from origin
      const originResponse = await fetch(request);

      // 5. Active Edge Content Optimization
      // If the visitor is an AI Search Crawler and requesting HTML, rewrite to clean semantic Markdown
      const isSearchCrawler = bot.isBot && (bot.kind === 'search' || bot.kind === 'training');
      const contentType = originResponse.headers.get('content-type') || '';
      const isHtml = contentType.includes('text/html');

      if (config.optimizeForBots && isSearchCrawler && isHtml && originResponse.ok) {
        try {
          const rawHtml = await originResponse.text();
          const transformed = transformHtmlForAiCrawler({
            domain: config.domain,
            url: request.url,
            rawHtml,
            botName: bot.name || 'AI Crawler',
          });

          return new Response(transformed.markdown, {
            status: 200,
            headers: {
              ...transformed.headers,
              'X-CiteRoute-Tracked': '1',
            },
          });
        } catch (err) {
          if (config.debug) {
            console.warn('[CiteRoute Edge] Content optimization fallback to origin HTML:', err);
          }
        }
      }

      // 6. Normal pass-through for humans & non-search requests
      const newHeaders = new Headers(originResponse.headers);
      newHeaders.set('x-citeroute-tracked', '1');
      if (bot.isBot && bot.name) {
        newHeaders.set('x-citeroute-bot', bot.name);
      }

      return new Response(originResponse.body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: newHeaders,
      });
    },
  };
}
