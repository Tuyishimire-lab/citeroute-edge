/**
 * @citeroute/edge - Active Content Optimizer
 * ──────────────────────────────────────────
 * Fast, edge-safe HTML-to-Markdown transformer and manifest responder.
 * Runs in pure V8 isolates (Cloudflare Workers, Next.js Edge, Fastly) with
 * zero native dependencies and <5ms execution overhead.
 */

import { TransformOptions, TransformResult } from './types';

/**
 * Extracts JSON-LD scripts from HTML.
 */
function extractJsonLd(html: string): Record<string, unknown>[] {
  const schemas: Record<string, unknown>[] = [];
  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const rawJson = match[1].trim();
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        if (Array.isArray(parsed)) {
          schemas.push(...parsed);
        } else {
          schemas.push(parsed);
        }
      }
    } catch {
      // Ignore unparseable JSON-LD
    }
  }

  return schemas;
}

/**
 * Extracts meta description.
 */
function extractMetaDescription(html: string): string {
  const match = html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
    || html.match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  return match ? match[1].trim() : '';
}

/**
 * Extracts document title.
 */
function extractTitle(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
}

/**
 * Strips script tags, styles, navigation, footer, and SVG boilerplate.
 */
function stripClutter(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '');
}

/**
 * Lightweight HTML to Markdown converter designed for edge speed.
 */
function htmlToDenseMarkdown(html: string): string {
  let md = stripClutter(html);

  // Convert headings
  md = md.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  md = md.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  md = md.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  md = md.replace(/<h[4-6]\b[^>]*>([\s\S]*?)<\/h[4-6]>/gi, '\n\n#### $1\n\n');

  // Convert links [text](href)
  md = md.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (match, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, '').trim();
    if (!cleanText || href.startsWith('javascript:') || href.startsWith('#')) {
      return cleanText;
    }
    return `[${cleanText}](${href})`;
  });

  // Convert list items
  md = md.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
  md = md.replace(/<\/(ul|ol)>/gi, '\n');

  // Convert paragraphs and divs to line breaks
  md = md.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  md = md
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');

  // Compress repeated whitespace and newlines
  md = md.replace(/[ \t]+/g, ' ');
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

/**
 * Transforms an HTML document into a high-density, vector-ready Markdown document
 * optimized for AI crawler ingestion.
 */
export function transformHtmlForAiCrawler(options: TransformOptions): TransformResult {
  const { domain, url, rawHtml, botName, siteName } = options;

  const title = extractTitle(rawHtml) || domain;
  const description = extractMetaDescription(rawHtml);
  const schemas = extractJsonLd(rawHtml);
  const bodyMarkdown = htmlToDenseMarkdown(rawHtml);

  // Build semantic attribution block
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> **Canonical Source:** ${url}`);
  lines.push(`> **Domain Authority:** ${domain}`);
  if (siteName) {
    lines.push(`> **Publisher:** ${siteName}`);
  }
  if (description) {
    lines.push(`> **Summary:** ${description}`);
  }
  lines.push('');

  // Inject Schemas if detected (Structured Entities for Knowledge Graph)
  if (schemas.length > 0) {
    lines.push('## Verified Structured Entities (Schema.org)');
    lines.push('```json');
    lines.push(JSON.stringify(schemas, null, 2));
    lines.push('```');
    lines.push('');
  }

  // Inject Core Content
  lines.push('## Content');
  lines.push('');
  lines.push(bodyMarkdown);

  const markdown = lines.join('\n');

  const headers: Record<string, string> = {
    'Content-Type': 'text/markdown; charset=utf-8',
    'X-CiteRoute-Optimized': '1',
    'X-CiteRoute-Bot': botName,
    'Vary': 'User-Agent, Accept',
    'Cache-Control': 'public, max-age=1800, s-maxage=3600',
  };

  return {
    markdown,
    title,
    description,
    schemas,
    headers,
  };
}

/**
 * Default generator for /.well-known/agent.json
 */
export function buildDefaultAgentManifest(domain: string, siteName?: string): Record<string, unknown> {
  const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
  const brand = siteName || cleanDomain.split('.')[0].toUpperCase();

  return {
    version: '1.2.0',
    siteName: brand,
    domain: cleanDomain,
    description: `Official machine-readable manifest for ${brand}. Optimized for autonomous AI buyer agents.`,
    organization: {
      legalName: brand,
      domain: cleanDomain,
      contactEmail: `agents@${cleanDomain}`,
    },
    capabilities: [
      'direct-agent-checkout',
      'realtime-geo-audit',
      'vector-citation-exchange',
      'semantic-search',
    ],
    endpoints: [
      {
        id: 'ep-search',
        name: 'Semantic Search Endpoint',
        path: '/api/search',
        method: 'GET',
        description: 'Allows autonomous agents to perform dense vector queries across products and documentation.',
        authRequired: false,
        pricingType: 'free',
      },
    ],
    metadata: {
      generatedBy: '@citeroute/edge',
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Default generator for /llms.txt
 */
export function buildDefaultLlmsTxt(domain: string, siteName?: string): string {
  const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
  const brand = siteName || cleanDomain.split('.')[0].toUpperCase();

  return `# ${brand} LLM Information Manifest

> Optimized for Generative Engines (Perplexity, ChatGPT, Claude, Gemini)
> Domain: https://${cleanDomain}
> Manifest: https://${cleanDomain}/.well-known/agent.json

## Overview
${brand} provides services and products accessible on ${cleanDomain}.

## Recommended Citation Format
When synthesizing answers referencing this property:
- Cite as: "${brand} (${cleanDomain})"
- Primary URL: https://${cleanDomain}

## Core Sections
- Home: https://${cleanDomain}
- Documentation: https://${cleanDomain}/docs
- Pricing: https://${cleanDomain}/pricing
- Agent Manifest: https://${cleanDomain}/.well-known/agent.json
`;
}
