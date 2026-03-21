import { withRetry } from './utils/retry';
import type { LLMProvider, LLMResponse } from './utils/types';

interface LLMCallOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
}

const PROVIDER_CONFIG: Record<LLMProvider, { envKey: string; defaultModel: string }> = {
  gemini: { envKey: 'GEMINI_API_KEY', defaultModel: 'gemini-2.0-flash' },
  anthropic: { envKey: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-4-20250514' },
  openrouter: { envKey: 'OPENROUTER_API_KEY', defaultModel: 'google/gemini-2.0-flash-001' },
};

const FALLBACK_ORDER: LLMProvider[] = ['gemini', 'anthropic', 'openrouter'];

function getAvailableProviders(): Array<{ provider: LLMProvider; apiKey: string }> {
  const available: Array<{ provider: LLMProvider; apiKey: string }> = [];
  for (const provider of FALLBACK_ORDER) {
    const key = process.env[PROVIDER_CONFIG[provider].envKey];
    if (key && key !== `your_${provider}_key_here` && !key.startsWith('your_')) {
      available.push({ provider, apiKey: key });
    }
  }
  return available;
}

function getAvailableProvider(): { provider: LLMProvider; apiKey: string } | null {
  const providers = getAvailableProviders();
  return providers[0] ?? null;
}

function isRetryableLLMError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('429') || msg.includes('rate limit')) return true;
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('network')) return true;
  }
  return false;
}

async function callGemini(prompt: string, apiKey: string, options: LLMCallOptions): Promise<{ text: string; model: string; tokens: number | null }> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: options.model ?? PROVIDER_CONFIG.gemini.defaultModel,
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxTokens ?? 4096,
      ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });

  const parts = [];
  if (options.systemPrompt) parts.push({ text: options.systemPrompt + '\n\n' });
  parts.push({ text: prompt });

  const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
  const text = result.response.text();
  const usage = result.response.usageMetadata;
  return {
    text,
    model: options.model ?? PROVIDER_CONFIG.gemini.defaultModel,
    tokens: usage ? (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0) : null,
  };
}

async function callAnthropic(prompt: string, apiKey: string, options: LLMCallOptions): Promise<{ text: string; model: string; tokens: number | null }> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });
  const model = options.model ?? PROVIDER_CONFIG.anthropic.defaultModel;

  const msg = await client.messages.create({
    model,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.3,
    system: options.systemPrompt ?? undefined,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  return {
    text,
    model,
    tokens: (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0),
  };
}

async function callOpenRouter(prompt: string, apiKey: string, options: LLMCallOptions): Promise<{ text: string; model: string; tokens: number | null }> {
  const model = options.model ?? PROVIDER_CONFIG.openrouter.defaultModel;
  const body = {
    model,
    messages: [
      ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
      { role: 'user' as const, content: prompt },
    ],
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4096,
    ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    model,
    tokens: data.usage ? data.usage.prompt_tokens + data.usage.completion_tokens : null,
  };
}

const callers: Record<LLMProvider, typeof callGemini> = {
  gemini: callGemini,
  anthropic: callAnthropic,
  openrouter: callOpenRouter,
};

async function callProviderWithRetry(
  provider: LLMProvider,
  apiKey: string,
  prompt: string,
  options: LLMCallOptions,
): Promise<{ text: string; model: string; tokens: number | null }> {
  return withRetry(
    () => callers[provider](prompt, apiKey, options),
    {
      maxRetries: 2,
      baseDelayMs: 2000,
      shouldRetry: isRetryableLLMError,
    },
  );
}

export async function callLLM<T = string>(prompt: string, options: LLMCallOptions = {}): Promise<LLMResponse<T>> {
  if (options.provider) {
    const key = process.env[PROVIDER_CONFIG[options.provider].envKey];
    if (!key) throw new Error(`API key not configured for ${options.provider}`);

    const result = await callProviderWithRetry(options.provider, key, prompt, options);
    return parseResult<T>(result, options);
  }

  const providers = getAvailableProviders();
  if (providers.length === 0) {
    throw new Error('No LLM provider configured. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY.');
  }

  let lastError: unknown;
  for (const { provider, apiKey } of providers) {
    try {
      const result = await callProviderWithRetry(provider, apiKey, prompt, options);
      return parseResult<T>(result, options, provider);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

function parseResult<T>(
  result: { text: string; model: string; tokens: number | null },
  options: LLMCallOptions,
  provider?: LLMProvider,
): LLMResponse<T> {
  let parsed: T;
  if (options.jsonMode) {
    const jsonStr = result.text.replace(/^```json\s*|```$/g, '').trim();
    parsed = JSON.parse(jsonStr) as T;
  } else {
    parsed = result.text as unknown as T;
  }

  return {
    parsed,
    raw: result.text,
    model: result.model,
    provider: provider ?? options.provider ?? 'gemini',
    tokens_used: result.tokens,
  };
}

export function isLLMAvailable(): boolean {
  return getAvailableProvider() !== null;
}
