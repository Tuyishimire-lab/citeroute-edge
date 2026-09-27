import { describe, it, expect, vi } from 'vitest';
import { createNextMiddleware } from '../src/adapters/nextjs';
import { createCloudflareHandler } from '../src/adapters/cloudflare';
import { createExpressMiddleware } from '../src/adapters/express';

describe('@citeroute/edge - Multi-Runtime Adapters', () => {
  describe('Next.js Adapter', () => {
    const middleware = createNextMiddleware({
      domain: 'testsite.com',
      apiKey: 'cr-live_test123',
      endpoint: 'https://mock.citeroute.com/api/v1/track',
    });

    it('serves /.well-known/agent.json directly', async () => {
      const req = new Request('https://testsite.com/.well-known/agent.json', {
        headers: { 'user-agent': 'GPTBot/1.2' },
      }) as any;
      req.nextUrl = new URL(req.url);

      const waitUntil = vi.fn();
      const res = await middleware(req, { waitUntil });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      expect(res.headers.get('X-CiteRoute-Protocol')).toBe('agent-v1.2');

      const json = await res.json();
      expect(json.domain).toBe('testsite.com');
      expect(waitUntil).toHaveBeenCalled();
    });

    it('serves /llms.txt directly', async () => {
      const req = new Request('https://testsite.com/llms.txt', {
        headers: { 'user-agent': 'PerplexityBot/1.0' },
      }) as any;
      req.nextUrl = new URL(req.url);

      const waitUntil = vi.fn();
      const res = await middleware(req, { waitUntil });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/markdown');

      const text = await res.text();
      expect(text).toContain('LLM Information Manifest');
      expect(waitUntil).toHaveBeenCalled();
    });

    it('tags responses with x-citeroute-tracked on regular pages', async () => {
      const req = new Request('https://testsite.com/pricing', {
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      }) as any;
      req.nextUrl = new URL(req.url);

      const res = await middleware(req);
      expect(res.headers.get('x-citeroute-tracked')).toBe('1');
    });
  });

  describe('Cloudflare Adapter', () => {
    it('actively transforms origin HTML to Markdown for AI search crawlers', async () => {
      const originHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Cloudflare Test</title></head>
          <body>
            <nav>Nav</nav>
            <h1>Product Alpha</h1>
            <p>High speed analytics.</p>
          </body>
        </html>
      `;

      // Mock global fetch to return originHtml
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: any) => {
        const urlStr = typeof input === 'string' ? input : input.url;
        if (urlStr.includes('/api/v1/track')) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(originHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      });

      try {
        const handler = createCloudflareHandler({
          domain: 'cf-test.com',
          optimizeForBots: true,
          endpoint: 'https://mock.citeroute.com/api/v1/track',
        });

        const req = new Request('https://cf-test.com/products/alpha', {
          headers: { 'user-agent': 'PerplexityBot/1.0' },
        });

        const waitUntil = vi.fn();
        const res = await handler.fetch(req, {}, { waitUntil });

        expect(res.status).toBe(200);
        expect(res.headers.get('X-CiteRoute-Optimized')).toBe('1');
        expect(res.headers.get('Content-Type')).toContain('text/markdown');

        const md = await res.text();
        expect(md).toContain('# Cloudflare Test');
        expect(md).toContain('# Product Alpha');
        expect(md).toContain('High speed analytics.');
        expect(md).not.toContain('<nav>');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Express Adapter', () => {
    const middleware = createExpressMiddleware({
      domain: 'express-test.com',
      endpoint: 'https://mock.citeroute.com/api/v1/track',
    });

    it('attaches x-citeroute-tracked and calls next() on normal requests', () => {
      const headers: Record<string, string> = { 'user-agent': 'Mozilla/5.0' };
      const setHeaders: Record<string, string> = {};

      const req: any = {
        url: '/about',
        headers,
      };

      const res: any = {
        setHeader: (k: string, v: string) => { setHeaders[k.toLowerCase()] = v; },
      };

      const next = vi.fn();
      middleware(req, res, next);

      expect(setHeaders['x-citeroute-tracked']).toBe('1');
      expect(next).toHaveBeenCalled();
    });

    it('serves /.well-known/agent.json via res.json()', () => {
      let jsonPayload: any = null;
      const setHeaders: Record<string, string> = {};

      const req: any = {
        url: '/.well-known/agent.json',
        headers: { 'user-agent': 'GPTBot' },
      };

      const res: any = {
        setHeader: (k: string, v: string) => { setHeaders[k.toLowerCase()] = v; },
        json: (val: any) => { jsonPayload = val; },
      };

      const next = vi.fn();
      middleware(req, res, next);

      expect(setHeaders['x-citeroute-protocol']).toBe('agent-v1.2');
      expect(jsonPayload.domain).toBe('express-test.com');
      expect(next).not.toHaveBeenCalled();
    });
  });
});
