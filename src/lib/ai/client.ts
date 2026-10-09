/**
 * src/lib/ai/client.ts
 * 100% Local AI Client powered exclusively by local Ollama (qwen2.5-coder:3b).
 * Zero cloud dependencies, zero external API keys.
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

const OLLAMA_URL = (
  process.env.OLLAMA_URL ||
  process.env.NEXT_PUBLIC_OLLAMA_URL ||
  'http://localhost:11434'
).replace(/\/$/, '');

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL ||
  process.env.NEXT_PUBLIC_OLLAMA_MODEL ||
  'qwen2.5-coder:3b';

/**
 * Sends a chat completion request to the local Ollama instance.
 * Supports OpenAI-compatible /v1/chat/completions with fallback to native /api/chat.
 */
export async function generateChatCompletion(
  messages: AIMessage[],
  options: AIOptions = {}
): Promise<{ text: string; provider: 'ollama' }> {
  const { maxTokens = 1024, temperature = 0.2, timeoutMs = 30000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. Try OpenAI-compatible endpoint
    const url = `${OLLAMA_URL}/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) {
        return { text: content, provider: 'ollama' };
      }
    }

    // 2. Fallback to native Ollama /api/chat endpoint if /v1 was not available
    const nativeRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        options: {
          num_predict: maxTokens,
          temperature,
        },
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!nativeRes.ok) {
      const errText = await nativeRes.text().catch(() => '');
      throw new Error(`Ollama error ${nativeRes.status}: ${errText || nativeRes.statusText}`);
    }

    const nativeData = await nativeRes.json();
    const nativeContent = nativeData.message?.content?.trim() ?? '';
    if (!nativeContent) {
      throw new Error(`Empty response from local Ollama model (${OLLAMA_MODEL})`);
    }

    return { text: nativeContent, provider: 'ollama' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Local Ollama request timed out after ${timeoutMs / 1000}s`);
    }
    if (err.message?.includes('fetch failed') || err.message?.includes('ECONNREFUSED')) {
      throw new Error(
        `Local Ollama is not reachable at ${OLLAMA_URL}. Ensure Ollama is running ('ollama run ${OLLAMA_MODEL}').`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
