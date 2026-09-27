/**
 * @citeroute/edge - Core Type Definitions
 * ───────────────────────────────────────
 * Zero external dependency types for Edge Middleware, Cloudflare Workers,
 * and standard WinterCG runtimes.
 */

export type TrafficClass =
  | 'HUMAN'
  | 'AI_TRAINING_CRAWLER' // GPTBot, CCBot, etc. - model training crawls
  | 'AI_SEARCH_CRAWLER'   // OAI-SearchBot, PerplexityBot - live search indexing
  | 'AI_AGENT'            // Autonomous buyer/tooling agents (operator-style)
  | 'AI_ANSWER_ENGINE';   // Referral traffic arriving FROM an answer engine

export type TelemetryEventType =
  | 'AI_CITATION'
  | 'AGENT_TX'
  | 'P2P_MESH_CLICK'
  | 'GEO_INDEX_PING';

export interface ClassifiedBot {
  isBot: boolean;
  classification: TrafficClass;
  name: string | null;
  kind: 'training' | 'search' | 'agent' | 'referral' | null;
  eventType: TelemetryEventType;
  referredBy: string | null;
  confidence: number;
}

export interface CiteRouteEdgeConfig {
  /** The root domain being tracked and optimized (e.g. "acme.com") */
  domain: string;

  /** CiteRoute API key (cr-live_...) for authenticated telemetry */
  apiKey?: string;

  /** Endpoint URL for CiteRoute telemetry ingestion */
  endpoint?: string;

  /**
   * Active Edge Optimization Mode:
   * When true, intercepts AI search bots and returns clean, high-density
   * Markdown + Schema.org JSON-LD directly from edge, stripping JS/CSS bloat.
   * Defaults to true.
   */
  optimizeForBots?: boolean;

  /**
   * Path to serve machine-readable agent manifest.
   * Defaults to "/.well-known/agent.json"
   */
  manifestPath?: string;

  /**
   * Path to serve LLM context guide.
   * Defaults to "/llms.txt"
   */
  llmsTxtPath?: string;

  /**
   * Optional custom agent manifest object to serve at manifestPath.
   */
  manifest?: Record<string, unknown>;

  /**
   * Optional custom llms.txt plain markdown to serve at llmsTxtPath.
   */
  llmsTxt?: string;

  /**
   * Optional paths or regexes to bypass bot optimization / telemetry.
   */
  ignorePaths?: (string | RegExp)[];

  /**
   * Hook called immediately when a bot is detected.
   */
  onBotDetected?: (bot: ClassifiedBot, request: Request) => void | Promise<void>;

  /**
   * Enable verbose console logging for debugging.
   */
  debug?: boolean;
}

export interface TelemetryPayload {
  domain: string;
  path: string;
  type: TelemetryEventType;
  source: string;
  intent?: string;
  userAgent?: string;
  referer?: string | null;
  destinationUrl?: string;
  optimized?: boolean;
}

export interface TransformOptions {
  domain: string;
  url: string;
  rawHtml: string;
  botName: string;
  siteName?: string;
}

export interface TransformResult {
  markdown: string;
  title: string;
  description: string;
  schemas: Record<string, unknown>[];
  headers: Record<string, string>;
}
