import { describe, it, expect } from 'vitest';
import { classifyEdgeRequest } from '../src/classifier';

describe('@citeroute/edge - Classifier', () => {
  it('identifies human browsers accurately', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    const res = classifyEdgeRequest(ua, 'https://google.com');

    expect(res.isBot).toBe(false);
    expect(res.classification).toBe('HUMAN');
    expect(res.name).toBeNull();
  });

  it('identifies AI training crawlers', () => {
    const bot1 = classifyEdgeRequest('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)', null);
    expect(bot1.isBot).toBe(true);
    expect(bot1.classification).toBe('AI_TRAINING_CRAWLER');
    expect(bot1.name).toBe('GPTBot');

    const bot2 = classifyEdgeRequest('ClaudeBot/1.0; +claudebot@anthropic.com', null);
    expect(bot2.isBot).toBe(true);
    expect(bot2.classification).toBe('AI_TRAINING_CRAWLER');
    expect(bot2.name).toBe('ClaudeBot');

    const bot3 = classifyEdgeRequest('CCBot/2.0 (https://commoncrawl.org/faq/)', null);
    expect(bot3.isBot).toBe(true);
    expect(bot3.classification).toBe('AI_TRAINING_CRAWLER');
    expect(bot3.name).toBe('CCBot');
  });

  it('identifies AI search crawlers with high confidence', () => {
    const searchBot = classifyEdgeRequest('Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', null);
    expect(searchBot.isBot).toBe(true);
    expect(searchBot.classification).toBe('AI_SEARCH_CRAWLER');
    expect(searchBot.name).toBe('PerplexityBot');
    expect(searchBot.eventType).toBe('AI_CITATION');

    const oaiSearch = classifyEdgeRequest('OAI-SearchBot/1.0; +https://openai.com/searchbot', null);
    expect(oaiSearch.isBot).toBe(true);
    expect(oaiSearch.classification).toBe('AI_SEARCH_CRAWLER');
    expect(oaiSearch.name).toBe('OAI-SearchBot');
  });

  it('identifies autonomous agent frameworks', () => {
    const langchain = classifyEdgeRequest('langchain-agent/0.1.0 python/3.11', null);
    expect(langchain.isBot).toBe(true);
    expect(langchain.classification).toBe('AI_AGENT');
    expect(langchain.eventType).toBe('AGENT_TX');

    const operator = classifyEdgeRequest('openai-operator-browser/1.0', null);
    expect(operator.isBot).toBe(true);
    expect(operator.classification).toBe('AI_AGENT');
  });

  it('identifies answer engine referrals based on referrer host', () => {
    const humanUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
    const refChatGpt = classifyEdgeRequest(humanUa, 'https://chatgpt.com/c/12345');

    expect(refChatGpt.isBot).toBe(true);
    expect(refChatGpt.classification).toBe('AI_ANSWER_ENGINE');
    expect(refChatGpt.referredBy).toBe('ChatGPT');

    const refPerplexity = classifyEdgeRequest(humanUa, 'https://www.perplexity.ai/search?q=best+crm');
    expect(refPerplexity.isBot).toBe(true);
    expect(refPerplexity.classification).toBe('AI_ANSWER_ENGINE');
    expect(refPerplexity.referredBy).toBe('Perplexity');
  });

  it('filters out CI/CD and standard search engines from bot telemetry', () => {
    const googlebot = classifyEdgeRequest('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', null);
    expect(googlebot.isBot).toBe(false);
    expect(googlebot.classification).toBe('HUMAN');

    const githubAction = classifyEdgeRequest('GitHub-Actions-Runner/2.311.0', null);
    expect(githubAction.isBot).toBe(false);

    const pingdom = classifyEdgeRequest('Pingdom.com_bot_version_1.4', null);
    expect(pingdom.isBot).toBe(false);
  });
});
