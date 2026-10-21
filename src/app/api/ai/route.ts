import { NextRequest, NextResponse } from 'next/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_TIMEOUT = 12000; // ms

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

    if (!GROQ_API_KEY) {
      return NextResponse.json({ error: 'NO_GROQ_KEY' }, { status: 503 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
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
        return NextResponse.json({ error: `Groq error: ${res.status} ${errText}` }, { status: res.status });
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim() ?? '';
      return NextResponse.json({ text: content });
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Groq request timed out' }, { status: 504 });
    }
    console.error('[/api/ai]', err);
    return NextResponse.json({ error: err.message || 'AI request failed' }, { status: 500 });
  }
}
