import { describe, it, expect } from 'vitest';
import {
  transformHtmlForAiCrawler,
  buildDefaultAgentManifest,
  buildDefaultLlmsTxt,
} from '../src/optimizer';

describe('@citeroute/edge - Optimizer', () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Acme Inc - Next Gen Cloud Platform</title>
        <meta name="description" content="Acme provides high-speed cloud infrastructure for AI and web apps.">
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Acme Cloud",
            "offers": {
              "@type": "Offer",
              "price": "49.00",
              "priceCurrency": "USD"
            }
          }
        </script>
        <style>body { background: #000; color: #fff; }</style>
      </head>
      <body>
        <nav>
          <a href="/login">Login</a>
          <a href="/signup">Sign Up</a>
        </nav>
        <main>
          <h1>Next Gen Cloud Infrastructure</h1>
          <p>Deploy your fullstack applications globally in under 5 minutes.</p>
          <h2>Key Features</h2>
          <ul>
            <li>Instant Edge Deployments</li>
            <li>Sub-millisecond cold starts</li>
          </ul>
          <a href="https://acme.com/pricing">Explore Pricing Plans</a>
        </main>
        <footer>
          <p>© 2026 Acme Corp. All rights reserved.</p>
        </footer>
      </body>
    </html>
  `;

  it('transforms HTML to dense, vector-ready Markdown for AI crawlers', () => {
    const res = transformHtmlForAiCrawler({
      domain: 'acme.com',
      url: 'https://acme.com',
      rawHtml: sampleHtml,
      botName: 'GPTBot',
      siteName: 'Acme Cloud',
    });

    expect(res.title).toBe('Acme Inc - Next Gen Cloud Platform');
    expect(res.description).toContain('Acme provides high-speed cloud infrastructure');
    expect(res.schemas).toHaveLength(1);
    expect((res.schemas[0] as any).name).toBe('Acme Cloud');

    // Headers verification
    expect(res.headers['Content-Type']).toBe('text/markdown; charset=utf-8');
    expect(res.headers['X-CiteRoute-Optimized']).toBe('1');
    expect(res.headers['X-CiteRoute-Bot']).toBe('GPTBot');
    expect(res.headers['Vary']).toContain('User-Agent');

    // Markdown content verification
    expect(res.markdown).toContain('# Acme Inc - Next Gen Cloud Platform');
    expect(res.markdown).toContain('> **Canonical Source:** https://acme.com');
    expect(res.markdown).toContain('## Verified Structured Entities (Schema.org)');
    expect(res.markdown).toContain('# Next Gen Cloud Infrastructure');
    expect(res.markdown).toContain('- Instant Edge Deployments');
    expect(res.markdown).toContain('[Explore Pricing Plans](https://acme.com/pricing)');

    // Clutter stripped
    expect(res.markdown).not.toContain('<style>');
    expect(res.markdown).not.toContain('background: #000');
    expect(res.markdown).not.toContain('Login');
    expect(res.markdown).not.toContain('Sign Up');
  });

  it('generates compliant default agent manifest', () => {
    const manifest = buildDefaultAgentManifest('acme.com', 'Acme Corporation') as any;

    expect(manifest.version).toBe('1.2.0');
    expect(manifest.siteName).toBe('Acme Corporation');
    expect(manifest.domain).toBe('acme.com');
    expect(manifest.capabilities).toContain('direct-agent-checkout');
    expect(manifest.endpoints).toHaveLength(1);
  });

  it('generates clean default llms.txt document', () => {
    const txt = buildDefaultLlmsTxt('acme.com', 'Acme Cloud');

    expect(txt).toContain('# Acme Cloud LLM Information Manifest');
    expect(txt).toContain('https://acme.com/.well-known/agent.json');
    expect(txt).toContain('Recommended Citation Format');
  });
});
