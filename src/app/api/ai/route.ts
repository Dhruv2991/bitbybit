import { NextRequest, NextResponse } from 'next/server';

const AI_API_KEY =
  process.env.GROQ_API_KEY ||
  process.env.OPENROUTER_API_KEY ||
  process.env.OPENAI_API_KEY ||
  process.env.AI_API_KEY ||
  '';

const AI_MODEL =
  process.env.GROQ_MODEL ||
  process.env.AI_MODEL ||
  process.env.OPENROUTER_MODEL ||
  'llama-3.3-70b-versatile';

const AI_TIMEOUT = 15000; // ms

function getEndpointUrl(model: string, apiKey: string): string {
  if (process.env.AI_BASE_URL) return process.env.AI_BASE_URL;
  if (process.env.GROQ_BASE_URL) return process.env.GROQ_BASE_URL;
  if (
    process.env.OPENROUTER_API_KEY ||
    apiKey.startsWith('sk-or-') ||
    model.startsWith('openai/') ||
    model.includes('/')
  ) {
    return 'https://openrouter.ai/api/v1/chat/completions';
  }
  if (process.env.OPENAI_API_KEY || apiKey.startsWith('sk-proj-')) {
    return 'https://api.openai.com/v1/chat/completions';
  }
  return 'https://api.groq.com/openai/v1/chat/completions';
}

/**
 * Universal content extractor for OpenAI, OpenRouter, Groq, and Gemini-style payloads.
 */
function extractResponseContent(data: any): string {
  if (!data) return '';
  if (typeof data === 'string') return data.trim();

  // 1. OpenAI / OpenRouter style: data.choices[0].message.content
  if (Array.isArray(data.choices) && data.choices.length > 0) {
    const firstChoice = data.choices[0];
    if (firstChoice?.message?.content !== undefined && firstChoice?.message?.content !== null) {
      if (typeof firstChoice.message.content === 'string') {
        return firstChoice.message.content.trim();
      }
      if (Array.isArray(firstChoice.message.content)) {
        return firstChoice.message.content
          .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
          .join('')
          .trim();
      }
    }
    if (typeof firstChoice?.text === 'string') {
      return firstChoice.text.trim();
    }
    if (typeof firstChoice?.delta?.content === 'string') {
      return firstChoice.delta.content.trim();
    }
  }

  // 2. Direct text field (custom proxy or Gemini text)
  if (typeof data.text === 'string') {
    return data.text.trim();
  }

  // 3. Gemini REST format: candidates[0].content.parts[0].text
  if (Array.isArray(data.candidates) && data.candidates.length > 0) {
    const parts = data.candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      return parts.map((p: any) => p?.text || '').join('').trim();
    }
  }

  // 4. response.text
  if (typeof data.response?.text === 'string') {
    return data.response.text.trim();
  }
  if (typeof data.content === 'string') {
    return data.content.trim();
  }

  return '';
}

interface AIMessage {
  role: 'system' | 'user';
  content: string;
}

interface AIRequestBody {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: AIRequestBody = await req.json();
    const { messages, maxTokens = 1024, temperature = 0.2 } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid messages' }, { status: 400 });
    }

    if (!AI_API_KEY) {
      return NextResponse.json({ error: 'NO_GROQ_KEY' }, { status: 503 });
    }

    const endpoint = getEndpointUrl(AI_MODEL, AI_API_KEY);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      };
      if (endpoint.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_SITE_URL || 'https://bitbybit.dev';
        headers['X-Title'] = 'BitByBit';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: AI_MODEL,
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        return NextResponse.json({ error: 'GROQ_RATE_LIMIT' }, { status: 429 });
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return NextResponse.json({ error: `AI error: ${res.status} ${errText}` }, { status: res.status });
      }

      const data = await res.json();
      const content = extractResponseContent(data);

      return NextResponse.json({
        text: content,
        content: content,
        choices: data.choices,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'AI request timed out' }, { status: 504 });
    }
    console.error('[/api/ai]', err);
    return NextResponse.json({ error: err.message || 'AI request failed' }, { status: 500 });
  }
}
