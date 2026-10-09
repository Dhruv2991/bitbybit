import { NextRequest, NextResponse } from 'next/server';
import { generateChatCompletion, AIMessage } from '@/lib/ai/client';

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

    const result = await generateChatCompletion(messages, {
      maxTokens,
      temperature,
    });

    return NextResponse.json({ text: result.text, provider: result.provider });
  } catch (err: any) {
    console.error('[/api/ai]', err);
    return NextResponse.json(
      { error: err.message || 'AI request failed' },
      { status: 500 }
    );
  }
}
