/**
 * @citeroute/edge - Edge Classifier
 * ─────────────────────────────────
 * High-performance, zero-dependency bot and agent classifier designed to run
 * inside Edge workers in under 0.1ms.
 */

import { ClassifiedBot, TrafficClass, TelemetryEventType } from './types';

/** Known AI crawlers by UA substring -> canonical name & kind */
export const AI_CRAWLERS: Record<string, { name: string; kind: 'training' | 'search' }> = {
  'gptbot': { name: 'GPTBot', kind: 'training' },
  'ccbot': { name: 'CCBot', kind: 'training' },
  'claudebot': { name: 'ClaudeBot', kind: 'training' },
  'claude-web': { name: 'Claude-Web', kind: 'training' },
  'anthropic-ai': { name: 'Anthropic AI', kind: 'training' },
  'google-extended': { name: 'Google-Extended', kind: 'training' },
  'bytespider': { name: 'Bytespider', kind: 'training' },
  'omgili': { name: 'Omgili', kind: 'training' },
  'diffbot': { name: 'Diffbot', kind: 'training' },
  'oai-searchbot': { name: 'OAI-SearchBot', kind: 'search' },
  'perplexitybot': { name: 'PerplexityBot', kind: 'search' },
  'perplexity-user': { name: 'Perplexity-User', kind: 'search' },
  'applebot-extended': { name: 'Applebot-Extended', kind: 'training' },
  'meta-externalagent': { name: 'Meta-ExternalAgent', kind: 'training' },
  'amazonbot': { name: 'Amazonbot', kind: 'training' },
  'cohere-ai': { name: 'Cohere AI', kind: 'training' },
  'youbot': { name: 'YouBot', kind: 'search' },
  'deepseekbot': { name: 'DeepSeekBot', kind: 'training' },
};

/** Answer-engine referrers - traffic arriving directly from an AI chat interface */
export const ANSWER_ENGINE_REFERRERS: Record<string, string> = {
  'chatgpt.com': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'perplexity.ai': 'Perplexity',
  'claude.ai': 'Claude',
  'gemini.google.com': 'Gemini',
  'copilot.microsoft.com': 'Copilot',
  'you.com': 'You.com',
  'poe.com': 'Poe',
  'arc.net': 'Arc Search',
  'duck.ai': 'DuckDuckGo AI',
};

/** UA markers of autonomous agent frameworks & tools */
export const AGENT_MARKERS = [
  'langchain',
  'auto-gpt',
  'autogpt',
  'agentgpt',
  'babyagi',
  'crewai',
  'openai-operator',
  'operator',
  'playwright',
  'puppeteer',
  'headlesschrome',
  'python-requests/2.',
  'axios/1.',
  'node-fetch',
  'got/',
  'scrapy',
  'httpx',
];

/** Hosting & CI patterns that contain headless markers but are NOT user agents */
const FALSE_POSITIVE_UA_PATTERNS = [
  /vercel/i,
  /render/i,
  /netlify/i,
  /cloudflare/i,
  /uptime/i,
  /pingdom/i,
  /statuspage/i,
  /datadog/i,
  /newrelic/i,
  /sentry/i,
  /github-actions/i,
  /gitlab-ci/i,
  /circleci/i,
  /googlebot\b/i,    // Standard organic Googlebot
  /bingbot\b/i,      // Standard organic Bingbot
  /yandexbot\b/i,
  /duckduckbot\b/i,
  /baiduspider\b/i,
];

function isFalsePositive(ua: string): boolean {
  return FALSE_POSITIVE_UA_PATTERNS.some((pattern) => pattern.test(ua));
}

function extractReferrerHost(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer.startsWith('http') ? referer : `https://${referer}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Classifies an incoming HTTP request using User-Agent and Referer headers.
 */
export function classifyEdgeRequest(
  userAgentHeader: string | null,
  refererHeader: string | null
): ClassifiedBot {
  const ua = (userAgentHeader || '').trim();
  const uaLower = ua.toLowerCase();
  const refHost = extractReferrerHost(refererHeader);

  // Default: Human
  const humanDefault: ClassifiedBot = {
    isBot: false,
    classification: 'HUMAN',
    name: null,
    kind: null,
    eventType: 'P2P_MESH_CLICK',
    referredBy: null,
    confidence: 1.0,
  };

  if (!ua) {
    return humanDefault;
  }

  // 1. Check for AI Answer Engine Referrals (highest conversion intent)
  if (refHost) {
    for (const [hostPattern, engineName] of Object.entries(ANSWER_ENGINE_REFERRERS)) {
      if (refHost === hostPattern || refHost.endsWith(`.${hostPattern}`)) {
        return {
          isBot: true,
          classification: 'AI_ANSWER_ENGINE',
          name: `${engineName} Referral`,
          kind: 'referral',
          eventType: 'AI_CITATION',
          referredBy: engineName,
          confidence: 0.95,
        };
      }
    }
  }

  // 2. Filter out known CI/CD, uptime monitors, and standard search bots
  if (isFalsePositive(ua)) {
    return humanDefault;
  }

  // 3. Check for Known AI Search & Training Crawlers
  for (const [marker, info] of Object.entries(AI_CRAWLERS)) {
    if (uaLower.includes(marker)) {
      const isSearch = info.kind === 'search';
      return {
        isBot: true,
        classification: isSearch ? 'AI_SEARCH_CRAWLER' : 'AI_TRAINING_CRAWLER',
        name: info.name,
        kind: info.kind,
        eventType: isSearch ? 'AI_CITATION' : 'GEO_INDEX_PING',
        referredBy: null,
        confidence: 0.98,
      };
    }
  }

  // 4. Check for Autonomous Agent Frameworks & Tooling
  for (const marker of AGENT_MARKERS) {
    if (uaLower.includes(marker)) {
      const name = `Agent (${marker})`;
      return {
        isBot: true,
        classification: 'AI_AGENT',
        name,
        kind: 'agent',
        eventType: 'AGENT_TX',
        referredBy: null,
        confidence: 0.85,
      };
    }
  }

  return humanDefault;
}
