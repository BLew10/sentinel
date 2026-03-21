import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProvider, LLMResponse } from './utils/types';

// ---------------------------------------------------------------------------
// Provider config — switch via LLM_PROVIDER env var
// ---------------------------------------------------------------------------

const LLM_PROVIDER: LLMProvider =
  (process.env.LLM_PROVIDER as LLMProvider | undefined) ?? 'anthropic';

const ANTHROPIC_MODEL =
  process.env.LLM_MODEL ?? 'claude-sonnet-4-20250514';
const GEMINI_MODEL =
  process.env.LLM_MODEL ?? 'gemini-2.0-flash';
const OPENROUTER_MODEL =
  process.env.LLM_MODEL ?? 'google/gemini-2.0-flash-exp:free';

const MAX_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Lazy-init singletons (avoid crashing when keys aren't set for unused providers)
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || key === 'your_key_here') {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Add it to .env or switch LLM_PROVIDER to "gemini" or "openrouter".',
      );
    }
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'your_key_here') {
      throw new Error(
        'GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey',
      );
    }
    _gemini = new GoogleGenerativeAI(key);
  }
  return _gemini;
}

function getOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key === 'your_key_here') {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Get a free key at https://openrouter.ai/keys',
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

async function callAnthropic(prompt: string): Promise<{
  text: string;
  model: string;
  tokens: number | null;
}> {
  const client = getAnthropic();
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : '';

  return {
    text,
    model: response.model,
    tokens:
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0),
  };
}

async function callGemini(prompt: string): Promise<{
  text: string;
  model: string;
  tokens: number | null;
}> {
  const client = getGemini();
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      maxOutputTokens: MAX_TOKENS,
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const usage = result.response.usageMetadata;

  return {
    text,
    model: GEMINI_MODEL,
    tokens: usage
      ? (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0)
      : null,
  };
}

async function callOpenRouter(prompt: string): Promise<{
  text: string;
  model: string;
  tokens: number | null;
}> {
  const apiKey = getOpenRouterKey();

  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'Sentinel',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    text: data.choices[0]?.message?.content ?? '',
    model: data.model ?? OPENROUTER_MODEL,
    tokens: data.usage
      ? data.usage.prompt_tokens + data.usage.completion_tokens
      : null,
  };
}

// ---------------------------------------------------------------------------
// Unified entry point
// ---------------------------------------------------------------------------

/**
 * Send a prompt to the configured LLM and parse the JSON response.
 *
 * Generic parameter `T` is the expected parsed shape. The caller is
 * responsible for runtime validation — this function only does JSON.parse.
 *
 * Throws on network errors. Returns `parsed: null` when the model returns
 * invalid JSON (caller should fall back to a neutral default).
 */
export async function generateJSON<T = unknown>(
  prompt: string,
): Promise<LLMResponse<T | null>> {
  const caller =
    LLM_PROVIDER === 'gemini'
      ? callGemini
      : LLM_PROVIDER === 'openrouter'
        ? callOpenRouter
        : callAnthropic;

  const { text, model, tokens } = await caller(prompt);

  let parsed: T | null = null;
  try {
    const cleaned = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(cleaned) as T;
  } catch {
    console.error(`[claude] Failed to parse JSON from ${LLM_PROVIDER}:`, text.slice(0, 200));
  }

  return {
    parsed,
    raw: text,
    model,
    provider: LLM_PROVIDER,
    tokens_used: tokens,
  };
}

/**
 * Convenience: returns the current provider name for logging / DB storage.
 */
export function getCurrentProvider(): { provider: LLMProvider; model: string } {
  const model =
    LLM_PROVIDER === 'gemini'
      ? GEMINI_MODEL
      : LLM_PROVIDER === 'openrouter'
        ? OPENROUTER_MODEL
        : ANTHROPIC_MODEL;
  return { provider: LLM_PROVIDER, model };
}
