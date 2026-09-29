# @citeroute/edge

**Official zero-dependency Edge SDK for AI bot detection, active semantic content optimization, and CiteRoute telemetry.**

[![npm version](https://img.shields.io/npm/v/@citeroute/edge.svg?color=05AD98)](https://www.npmjs.com/package/@citeroute/edge)
[![npm downloads](https://img.shields.io/npm/dw/@citeroute/edge.svg?color=05AD98)](https://www.npmjs.com/package/@citeroute/edge)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)]()
[![Edge Ready](https://img.shields.io/badge/edge-ready-black.svg)]()

CiteRoute Edge intercepts incoming traffic at the HTTP edge layer. It differentiates between human users, AI training crawlers (`GPTBot`, `ClaudeBot`), AI search engines (`PerplexityBot`, `OAI-SearchBot`), and autonomous agents (`LangChain`, `CrewAI`), and actively optimizes your content for LLM ingestion.

---

## Features

- **Zero Dependencies:** Pure TypeScript, zero external npm packages, runs inside any V8 isolate.
- **Active Content Optimization:** Dynamically transforms heavy React/HTML into high-density, vector-ready Markdown for AI crawlers with Schema.org JSON-LD preserved.
- **Agent Manifest Protocol:** Automatically serves compliant `/.well-known/agent.json` and `/llms.txt`.
- **Non-blocking Telemetry:** Uses `waitUntil()` execution contexts to report real crawler telemetry without adding any latency to visitor responses.
- **Multi-Runtime Adapters:** Native support for Next.js, Cloudflare Workers, Express, and standard WinterCG fetch handlers.

---

## Installation

```bash
npm install @citeroute/edge
# or
pnpm add @citeroute/edge
```

---

## Quick Start

### 1. Next.js 14, 15, and 16 (`middleware.ts` or `proxy.ts`)

```typescript
import { createNextMiddleware } from '@citeroute/edge/next';

export const middleware = createNextMiddleware({
  domain: 'acme.com',
  apiKey: process.env.CITEROUTE_API_KEY,
  optimizeForBots: true, // Rewrites bot responses to clean Markdown
});

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'],
};
```

### 2. Cloudflare Workers (`worker.ts`)

```typescript
import { createCloudflareHandler } from '@citeroute/edge/cloudflare';

export default createCloudflareHandler({
  domain: 'acme.com',
  apiKey: 'cr-live_your_api_key',
  optimizeForBots: true,
});
```

Deploy with Wrangler:
```bash
npx wrangler deploy
```

### 3. Node.js / Express

```typescript
import express from 'express';
import { createExpressMiddleware } from '@citeroute/edge/express';

const app = express();

app.use(createExpressMiddleware({
  domain: 'acme.com',
  apiKey: process.env.CITEROUTE_API_KEY,
}));
```

---

## Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `domain` | `string` | **Required** | The apex or subdomain being monitored (e.g. `acme.com`). |
| `apiKey` | `string` | `undefined` | Your CiteRoute API key (`cr-live_...`) for authenticated telemetry. |
| `endpoint` | `string` | CiteRoute cloud | Custom telemetry reporting endpoint URL. |
| `optimizeForBots` | `boolean` | `true` | Dynamically rewrites HTML to semantic Markdown when AI crawlers visit. |
| `manifestPath` | `string` | `/.well-known/agent.json` | Path where the machine-readable agent manifest is served. |
| `llmsTxtPath` | `string` | `/llms.txt` | Path where LLM contextual instructions are served. |
| `manifest` | `object` | Auto-generated | Custom `agent.json` manifest payload. |
| `llmsTxt` | `string` | Auto-generated | Custom `llms.txt` document. |
| `debug` | `boolean` | `false` | Enable verbose console logging. |

---

## How Active Content Optimization Works

When an AI crawler (such as `GPTBot` or `PerplexityBot`) visits a page on your domain:

1. **Detection:** CiteRoute Edge identifies the crawler from User-Agent signatures in `< 0.1ms`.
2. **Sanitization:** Removes navigation bars, footers, inline SVGs, script bundles, and CSS stylesheets.
3. **Structured Entity Retention:** Extracts all Schema.org JSON-LD entities and preserves them at the top of the document.
4. **Markdown Serialization:** Converts headings, lists, tables, and paragraphs into clean Markdown.
5. **Safe Edge Caching:** Emits `Vary: User-Agent, Accept` so CDN edge layers never cache bot responses for human visitors.

Result: LLMs receive **80% fewer wasted tokens**, zero client-side hydration failures, and complete entity comprehension.

---

## License

Apache-2.0 © CiteRoute Inc.
