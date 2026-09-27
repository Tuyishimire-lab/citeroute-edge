/**
 * @citeroute/edge - Express / Node.js Adapter
 * ───────────────────────────────────────────
 * Middleware for Express, Fastify, and standard Node.js HTTP servers.
 */

import { CiteRouteEdgeConfig } from '../types';
import { classifyEdgeRequest } from '../classifier';
import { dispatchTelemetry } from '../telemetry';
import { buildDefaultAgentManifest, buildDefaultLlmsTxt } from '../optimizer';

export interface ExpressRequestLike {
  url: string;
  originalUrl?: string;
  path?: string;
  headers: Record<string, string | string[] | undefined>;
  protocol?: string;
  get?: (header: string) => string | undefined;
}

export interface ExpressResponseLike {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ExpressResponseLike;
  send: (body: string) => void;
  json: (body: unknown) => void;
  headersSent?: boolean;
}

/**
 * Creates an Express / Node.js middleware.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createExpressMiddleware } from '@citeroute/edge/express';
 *
 * const app = express();
 * app.use(createExpressMiddleware({ domain: 'acme.com', apiKey: '...' }));
 * ```
 */
export function createExpressMiddleware(config: CiteRouteEdgeConfig) {
  const manifestPath = config.manifestPath || '/.well-known/agent.json';
  const llmsTxtPath = config.llmsTxtPath || '/llms.txt';

  return function citerouteExpressMiddleware(
    req: ExpressRequestLike,
    res: ExpressResponseLike,
    next: () => void
  ) {
    const rawPath = req.path || req.url.split('?')[0];
    const ua = (req.get ? req.get('user-agent') : (req.headers['user-agent'] as string)) || '';
    const referer = (req.get ? req.get('referer') : (req.headers['referer'] as string)) || null;

    // 1. Route: /.well-known/agent.json
    if (rawPath === manifestPath) {
      const manifest = config.manifest || buildDefaultAgentManifest(config.domain);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-CiteRoute-Protocol', 'agent-v1.2');
      res.setHeader('X-CiteRoute-Tracked', '1');

      dispatchTelemetry(
        {
          domain: config.domain,
          path: rawPath,
          type: 'GEO_INDEX_PING',
          source: 'Agent Discovery Bot',
          userAgent: ua || undefined,
          referer,
          optimized: true,
        },
        config
      ).catch(() => {});

      return res.json(manifest);
    }

    // 2. Route: /llms.txt
    if (rawPath === llmsTxtPath) {
      const llmsContent = config.llmsTxt || buildDefaultLlmsTxt(config.domain);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('X-CiteRoute-Protocol', 'llms-txt-v1');
      res.setHeader('X-CiteRoute-Tracked', '1');

      dispatchTelemetry(
        {
          domain: config.domain,
          path: rawPath,
          type: 'GEO_INDEX_PING',
          source: 'LLM Indexer',
          userAgent: ua || undefined,
          referer,
          optimized: true,
        },
        config
      ).catch(() => {});

      return res.send(llmsContent);
    }

    // 3. Classify and trace
    const bot = classifyEdgeRequest(ua, referer);
    res.setHeader('X-CiteRoute-Tracked', '1');

    if (bot.isBot) {
      if (bot.name) {
        res.setHeader('X-CiteRoute-Bot', bot.name);
      }

      dispatchTelemetry(
        {
          domain: config.domain,
          path: req.originalUrl || req.url,
          type: bot.eventType,
          source: bot.name || 'AI Bot',
          userAgent: ua || undefined,
          referer,
          optimized: !!config.optimizeForBots,
        },
        config
      ).catch(() => {});
    }

    next();
  };
}
