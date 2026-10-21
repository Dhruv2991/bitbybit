/**
 * gemini.ts — AI wrapper
 *
 * Routing: Groq (primary, fast) → Ollama (fallback, your Docker server)
 * Limits:  Stored in Supabase `ai_usage` table (per user account, bypass-proof)
 *          + localStorage cache (instant reads, no DB call on every render)
 * Access:  Subscribers only — non-subscribers get a friendly upgrade message
 *
 * Groq free tier:  30 req/min, 14,400 req/day, ~1-3s response
 * Ollama fallback: your Docker server, handles overflow
 */

import { getSupabaseClient } from '@/lib/supabase';

// ── Config ────────────────────────────────────────────────────────────────────

const AI_TIMEOUT    = 12000; // ms — fall back to Ollama after this

const OLLAMA_BASE   = process.env.NEXT_PUBLIC_OLLAMA_URL   ?? 'http://localhost:11434';
const OLLAMA_MODEL  = process.env.NEXT_PUBLIC_OLLAMA_MODEL ?? 'qwen2.5-coder:3b';

export const LIMITS = {
  explainFailure:  5,   // per day
  hint:            3,   // per problem per day
  reviewCode:      3,   // per day
  recommendations: 5,   // per day
  editorial:       2,   // per day
} as const;

const HINT_COOLDOWN_SECONDS = 30;

// ── Session state ─────────────────────────────────────────────────────────────

let _github       = '';
let _isSubscriber = false;

export function setAiUser(github: string, isSubscriber: boolean): void {
  if (_github === github && _isSubscriber === isSubscriber) return;
  _github       = github;
  _isSubscriber = isSubscriber;
  if (github) syncFromSupabase(github).catch(() => {});
}

// ── LocalStorage cache ────────────────────────────────────────────────────────
// Fast reads — Supabase is source of truth, this is just a UI cache

interface Cache {
  date:            string;
  github:          string;
  explainFailure:  number;
  reviewCode:      number;
  recommendations: number;
  editorial:       number;
  hints:           Record<string, number>;   // keyed by problem.id
  lastHintAt:      Record<string, number>;   // keyed by problem.id, epoch ms
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function emptyCache(github: string): Cache {
  return { date: todayStr(), github, explainFailure: 0, reviewCode: 0, recommendations: 0, editorial: 0, hints: {}, lastHintAt: {} };
}

function loadCache(): Cache {
  if (!_github) return emptyCache('');
  try {
    const raw = localStorage.getItem(`bb_ai_${_github}`);
    if (raw) {
      const p: Cache = JSON.parse(raw);
      if (p.date === todayStr() && p.github === _github) return p;
    }
  } catch {}
  return emptyCache(_github);
}

function saveCache(c: Cache) {
  try { localStorage.setItem(`bb_ai_${c.github}`, JSON.stringify(c)); } catch {}
}

// ── Supabase sync ─────────────────────────────────────────────────────────────

async function syncFromSupabase(github: string): Promise<void> {
  try {
    const db = getSupabaseClient();
    const { data } = await (db.from('ai_usage') as any)
      .select('feature, problem_id, used, last_used_at')
      .eq('github', github)
      .eq('date', todayStr());

    const cache = emptyCache(github);
    for (const row of data || []) {
      if      (row.feature === 'hint')           { cache.hints[row.problem_id] = row.used; cache.lastHintAt[row.problem_id] = row.last_used_at ? new Date(row.last_used_at).getTime() : 0; }
      else if (row.feature === 'explainFailure') cache.explainFailure  = row.used;
      else if (row.feature === 'reviewCode')     cache.reviewCode      = row.used;
      else if (row.feature === 'recommendations') cache.recommendations = row.used;
      else if (row.feature === 'editorial')      cache.editorial       = row.used;
    }
    saveCache(cache);
  } catch {}
}

export async function refreshUsageFromServer(): Promise<void> {
  if (_github) await syncFromSupabase(_github);
}

async function incrementSupabase(
  feature: 'explainFailure' | 'reviewCode' | 'recommendations' | 'editorial',
): Promise<void> {
  if (!_github) return;
  try {
    const db = getSupabaseClient();
    const { data } = await (db.from('ai_usage') as any)
      .select('used').eq('github', _github).eq('date', todayStr())
      .eq('feature', feature).eq('problem_id', '').maybeSingle();
    if (data) {
      await (db.from('ai_usage') as any)
        .update({ used: data.used + 1 })
        .eq('github', _github).eq('date', todayStr()).eq('feature', feature).eq('problem_id', '');
    } else {
      await (db.from('ai_usage') as any).insert({ github: _github, date: todayStr(), feature, problem_id: '', used: 1 });
    }
  } catch {}
}

async function incrementHintSupabase(problemId: string): Promise<void> {
  if (!_github) return;
  try {
    const db  = getSupabaseClient();
    const now = new Date().toISOString();
    const { data } = await (db.from('ai_usage') as any)
      .select('used').eq('github', _github).eq('date', todayStr())
      .eq('feature', 'hint').eq('problem_id', problemId).maybeSingle();
    if (data) {
      await (db.from('ai_usage') as any)
        .update({ used: data.used + 1, last_used_at: now })
        .eq('github', _github).eq('date', todayStr()).eq('feature', 'hint').eq('problem_id', problemId);
    } else {
      await (db.from('ai_usage') as any).insert({ github: _github, date: todayStr(), feature: 'hint', problem_id: problemId, used: 1, last_used_at: now });
    }
  } catch {}
}

// ── Limit checks ──────────────────────────────────────────────────────────────

function subscriberCheck(): string | null {
  if (!_github)       return '⛔ Sign in to use AI features.';
  if (!_isSubscriber) return '⭐ AI features are available to subscribers. Subscribe for ₹39/month for access to all AI tools + weekly challenges.';
  return null;
}

function checkGlobal(key: 'explainFailure' | 'reviewCode' | 'recommendations' | 'editorial'): string | null {
  const sub = subscriberCheck();
  if (sub) return sub;
  const cache = loadCache();
  if ((cache[key] as number) >= LIMITS[key])
    return `⛔ Daily limit reached — ${LIMITS[key]}/${LIMITS[key]} used today. Resets at midnight.`;
  return null;
}

function incrementLocal(key: 'explainFailure' | 'reviewCode' | 'recommendations' | 'editorial'): void {
  const cache = loadCache();
  (cache[key] as number)++;
  saveCache(cache);
  incrementSupabase(key).catch(() => {});
}

function checkHint(problemId: string): string | null {
  const sub = subscriberCheck();
  if (sub) return sub;
  const cache   = loadCache();
  const used    = cache.hints[problemId]    ?? 0;
  const lastAt  = cache.lastHintAt[problemId] ?? 0;
  const elapsed = Date.now() - lastAt;
  if (used >= LIMITS.hint)
    return `⛔ All ${LIMITS.hint} hints used for this problem. You've got this!`;
  if (lastAt > 0 && elapsed < HINT_COOLDOWN_SECONDS * 1000)
    return `⏳ Wait ${Math.ceil((HINT_COOLDOWN_SECONDS * 1000 - elapsed) / 1000)}s before the next hint.`;
  return null;
}

function incrementHintLocal(problemId: string): void {
  const cache = loadCache();
  cache.hints[problemId]      = (cache.hints[problemId]    ?? 0) + 1;
  cache.lastHintAt[problemId] = Date.now();
  saveCache(cache);
  incrementHintSupabase(problemId).catch(() => {});
}

// ── Public usage status ───────────────────────────────────────────────────────

export interface UsageStatus {
  isSubscriber:    boolean;
  explainFailure:  { used: number; limit: number; remaining: number };
  reviewCode:      { used: number; limit: number; remaining: number };
  recommendations: { used: number; limit: number; remaining: number };
  editorial:       { used: number; limit: number; remaining: number };
  getHintStatus:   (problemId: string) => { used: number; limit: number; remaining: number; cooldownSecondsLeft: number };
}

export function getUsageStatus(): UsageStatus {
  const cache = loadCache();
  return {
    isSubscriber: _isSubscriber,
    explainFailure:  { used: cache.explainFailure,  limit: LIMITS.explainFailure,  remaining: Math.max(0, LIMITS.explainFailure  - cache.explainFailure)  },
    reviewCode:      { used: cache.reviewCode,       limit: LIMITS.reviewCode,      remaining: Math.max(0, LIMITS.reviewCode      - cache.reviewCode)      },
    recommendations: { used: cache.recommendations, limit: LIMITS.recommendations, remaining: Math.max(0, LIMITS.recommendations - cache.recommendations) },
    editorial:       { used: cache.editorial,       limit: LIMITS.editorial,       remaining: Math.max(0, LIMITS.editorial       - cache.editorial)       },
    getHintStatus: (problemId: string) => {
      const used   = cache.hints[problemId]    ?? 0;
      const lastAt = cache.lastHintAt[problemId] ?? 0;
      const elapsed = Date.now() - lastAt;
      return {
        used, limit: LIMITS.hint, remaining: Math.max(0, LIMITS.hint - used),
        cooldownSecondsLeft: lastAt > 0 ? Math.max(0, Math.ceil((HINT_COOLDOWN_SECONDS * 1000 - elapsed) / 1000)) : 0,
      };
    },
  };
}

// ── Core: Server AI API (Groq) ────────────────────────────────────────────────

interface Msg { role: 'system' | 'user'; content: string; }

async function callGroq(messages: Msg[], maxTokens: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT);
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, maxTokens, temperature: 0.2 }),
      signal: controller.signal,
    });
    if (res.status === 429) throw new Error('GROQ_RATE_LIMIT');
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `AI error ${res.status}`);
    }
    const data = await res.json();
    return data.text?.trim() ?? '';
  } finally { clearTimeout(timer); }
}

// ── Core: Ollama fallback ─────────────────────────────────────────────────────

async function callOllama(messages: Msg[], maxTokens: number): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, max_tokens: maxTokens, temperature: 0.2, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Core: router — Groq → Ollama ─────────────────────────────────────────────

async function callAI(userPrompt: string, maxTokens: number, systemPrompt?: string): Promise<string> {
  const messages: Msg[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  let groqErr = '';

  // 1. Try server AI endpoint (Groq)
  try {
    const result = await callGroq(messages, maxTokens);
    if (result) return result;
  } catch (e: any) {
    groqErr = e.message || '';
    console.warn('AI endpoint failed, trying Ollama fallback:', groqErr);
  }

  // 2. Fallback: Ollama
  try {
    const result = await callOllama(messages, maxTokens);
    if (result) return result;
    return 'No response from AI.';
  } catch (e: any) {
    if (groqErr === 'NO_GROQ_KEY') {
      return '⚠️ Groq API key is not configured (NO_GROQ_KEY). Please set GROQ_API_KEY in your environment.';
    }
    if (groqErr === 'GROQ_RATE_LIMIT') {
      return '⚠️ Groq AI rate limit reached (429). Please wait a moment and try again.';
    }
    if (groqErr && !groqErr.includes('failed to fetch')) {
      return `⚠️ ${groqErr}`;
    }
    if (e.message?.includes('fetch failed') || e.message?.includes('ECONNREFUSED'))
      return '⚠️ AI service is currently unavailable. Please verify GROQ_API_KEY or connection.';
    return `AI error: ${e.message}`;
  }
}

function isBlocked(s: string) {
  return s.startsWith('⛔') || s.startsWith('⚠️') || s.startsWith('⏳');
}

// ── Feature 1: Why did my code fail? ─────────────────────────────────────────

export interface FailedCase { input: string; expected: string; actual: string; error?: string; }

export async function explainFailure(
  problemTitle: string, problemDescription: string,
  lang: string, code: string, failedCases: FailedCase[],
): Promise<string> {
  const blocked = checkGlobal('explainFailure');
  if (blocked) return blocked;

  const caseSummary = failedCases.slice(0, 3).map((c, i) =>
    `Case ${i + 1}:\n  Input: ${c.input}\n  Expected: ${c.expected}\n  Got: ${c.actual}${c.error ? `\n  Error: ${c.error}` : ''}`
  ).join('\n\n');

  const result = await callAI(
    `Problem: "${problemTitle}"\nLanguage: ${lang}\n\nStudent's code:\n\`\`\`${lang}\n${code}\n\`\`\`\n\nFailing test cases:\n${caseSummary}\n\nExplain in plain English (3-5 sentences max):\n1. WHY the code is failing\n2. What the bug or logical mistake is\n3. A nudge toward the fix WITHOUT giving the full solution`,
    400,
    'You are a coding tutor. Be direct, friendly, specific. Do not write corrected code.',
  );
  if (!isBlocked(result)) incrementLocal('explainFailure');
  return result;
}

// ── Feature 2: AI Hint ────────────────────────────────────────────────────────

export async function getAiHint(
  problemTitle: string, problemDescription: string,
  lang: string, code: string, hintNumber: number, problemId?: string,
): Promise<string> {
  const key     = problemId || problemTitle;
  const blocked = checkHint(key);
  if (blocked) return blocked;

  const hasCode = code.trim().length > 30;
  const result  = await callAI(
    `Problem Title: "${problemTitle}"\nDescription: ${problemDescription.replace(/<[^>]*>/g, '').slice(0, 700)}\nLanguage: ${lang}\nRequested Hint Number: ${hintNumber}\n\n${hasCode ? `Student's Current Code:\n\`\`\`${lang}\n${code.slice(0, 1000)}\n\`\`\`` : 'The student has written no code yet.'}\n\nOutput Hint #${hintNumber} in 2-3 sentences.`,
    200,
    `You are a strict coding mentor. Start directly with the hint. No pleasantries. No code solutions.\nHint 1: Conceptual direction. Hint 2: Specific pattern. Hint 3: Near-solution nudge.`,
  );
  if (!isBlocked(result)) incrementHintLocal(key);
  return result;
}

// ── Feature 3: Code Review ────────────────────────────────────────────────────

export async function reviewCode(
  problemTitle: string, lang: string, code: string, passed: number, total: number,
): Promise<string> {
  const blocked = checkGlobal('reviewCode');
  if (blocked) return blocked;

  const result = await callAI(
    `Problem: "${problemTitle}"\nLanguage: ${lang}\nTest result: ${passed}/${total} tests passed\n\nCode:\n\`\`\`${lang}\n${code.slice(0, 1200)}\n\`\`\`\n\nReview covering:\n1. **Time complexity**\n2. **Space complexity**\n3. **Code quality** — one improvement\n4. **Alternative approach** — one sentence`,
    500,
    'You are an expert code reviewer. Be concise, under 150 words, use bullet points.',
  );
  if (!isBlocked(result)) incrementLocal('reviewCode');
  return result;
}

// ── Feature 4: Problem Recommendations (with daily date-keyed cache) ─────────

function getDailyCachedRecommendations(userKey: string, dateStr: string): string[] | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const key = `bb_daily_problem_suggestions_${userKey}_${dateStr}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(x => typeof x === 'string')) {
      return parsed;
    }
  } catch {}
  return null;
}

function setDailyCachedRecommendations(userKey: string, dateStr: string, suggestions: string[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = `bb_daily_problem_suggestions_${userKey}_${dateStr}`;
    localStorage.setItem(key, JSON.stringify(suggestions));

    // Prune older cache entries for this user from previous dates
    const prefix = `bb_daily_problem_suggestions_${userKey}_`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && k !== key) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

export function getCachedDailyRecommendations(github?: string): string[] | null {
  const userKey = github || _github || 'guest';
  const today = todayStr();
  return getDailyCachedRecommendations(userKey, today);
}

export async function getRecommendations(
  solvedTitles: string[], availableTitles: string[],
): Promise<string[]> {
  if (!availableTitles.length) return [];

  const today = todayStr();
  const userKey = _github || 'guest';

  // 1. Check if a suggestion for the current calendar date (YYYY-MM-DD) already exists
  const cached = getDailyCachedRecommendations(userKey, today);
  if (cached && cached.length > 0) {
    return cached;
  }

  // 2. Check quota limits before calling AI
  const blocked = checkGlobal('recommendations');
  if (blocked) { console.warn(blocked); return []; }

  try {
    const raw = await callAI(
      `Solved: ${solvedTitles.slice(0, 20).join(', ') || 'None'}\nAvailable: ${availableTitles.slice(0, 30).join(', ')}\nRecommend exactly 3 from available. Output: ["Title1","Title2","Title3"]`,
      120,
      'Output ONLY a raw JSON array of strings. No markdown, no explanation.',
    );
    const match = raw.replace(/```(?:json)?/g, '').trim().match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('No array');
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) {
      const picks = parsed.slice(0, 3).filter((t: any) => typeof t === 'string');
      if (picks.length > 0) {
        incrementLocal('recommendations');
        // Store the suggestion once for today to prevent redundant API calls on subsequent visits
        setDailyCachedRecommendations(userKey, today, picks);
        return picks;
      }
    }
  } catch (e) { console.error('Recommendations error:', e); }
  return [];
}

// ── Feature 5: AI Editorial (post-challenge writeup) ─────────────────────────

export interface Editorial {
  approach:        string;
  complexity:      string;
  commonMistakes:  string;
  solutionPython:  string;
  solutionJs:      string;
}

export async function generateEditorial(
  problemTitle: string, problemDescription: string,
): Promise<{ editorial: Editorial | null; blocked: string | null }> {
  const blocked = checkGlobal('editorial');
  if (blocked) return { editorial: null, blocked };

  try {
    const raw = await callAI(
      `Problem: "${problemTitle}"\nDescription: ${problemDescription.replace(/<[^>]*>/g, '').slice(0, 1000)}\n\nWrite a full editorial. Output ONLY raw JSON with these exact keys:\n{"approach": "2-4 sentence explanation of the intended approach", "complexity": "time and space complexity, one line", "commonMistakes": "2-3 sentence description of common mistakes/edge cases", "solutionPython": "clean, properly formatted, multi-line python solution code, no markdown fences", "solutionJs": "clean, properly formatted, multi-line javascript solution code, no markdown fences"}\n\nCRITICAL formatting rule for solutionPython and solutionJs: these must be REAL, readable, multi-line code with proper indentation — never a single line. Encode every line break as an escaped \\n character inside the JSON string (e.g. "def foo():\\n    x = 1\\n    return x"), and use 4-space indentation. Do NOT write the solution as one line separated by semicolons or without newlines. Example of a correctly formatted value: "solutionPython": "def two_sum(nums, target):\\n    seen = {}\\n    for i, n in enumerate(nums):\\n        if target - n in seen:\\n            return [seen[target - n], i]\\n        seen[n] = i\\n    return []"`,
      900,
      'You are writing a LeetCode-style editorial. Output ONLY the raw JSON object. No markdown, no commentary, no code fences. Code in solutionPython/solutionJs must be properly indented, multi-line code using escaped \\n characters for every line break — never compress it onto a single line.',
    );
    const match = raw.replace(/```(?:json)?/g, '').trim().match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found');
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed === 'object') {
      incrementLocal('editorial');
      return {
        blocked: null,
        editorial: {
          approach:       parsed.approach       ?? '',
          complexity:     parsed.complexity     ?? '',
          commonMistakes: parsed.commonMistakes ?? '',
          solutionPython: parsed.solutionPython ?? '',
          solutionJs:     parsed.solutionJs     ?? '',
        },
      };
    }
  } catch (e) { console.error('Editorial generation error:', e); }
  return { editorial: null, blocked: '⚠️ Could not generate editorial — try again in a moment.' };
}

// ── Admin Feature: Auto Test Case Generator ───────────────────────────────────

export interface GeneratedTestCase {
  input:        string;
  expected:     string;
  output?:      string;
  is_hidden?:   boolean;
  explanation?: string;
}

/**
 * Safely extracts a JSON array from LLM responses, stripping code fences,
 * conversational preambles/postscripts, comments, trailing commas, or wrapping root objects.
 */
function extractJsonArray(raw: string): any[] {
  if (!raw || typeof raw !== 'string') return [];

  let text = raw.trim();

  // Strip leading and trailing markdown code block wrappers
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // 1. Try direct JSON.parse first
  try {
    const direct = JSON.parse(text);
    if (Array.isArray(direct)) return direct;
    if (direct && typeof direct === 'object') {
      for (const key of ['test_cases', 'testCases', 'tests', 'cases', 'data']) {
        if (Array.isArray((direct as any)[key])) return (direct as any)[key];
      }
    }
  } catch {}

  // 2. Locate outermost square brackets [ ... ] to ignore conversational preambles/fillers
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');

  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const arraySlice = text.substring(firstBracket, lastBracket + 1);

    try {
      const parsed = JSON.parse(arraySlice);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      try {
        const cleaned = arraySlice
          .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1') // remove comments
          .replace(/,\s*([}\]])/g, '$1'); // remove trailing commas
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
  }

  // 3. Check if wrapped in an outermost JSON object { ... }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const objSlice = text.substring(firstBrace, lastBrace + 1);
    try {
      const cleaned = objSlice
        .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1')
        .replace(/,\s*([}\]])/g, '$1');
      const parsedObj = JSON.parse(cleaned);
      if (parsedObj && typeof parsedObj === 'object') {
        for (const key of ['test_cases', 'testCases', 'tests', 'cases', 'data']) {
          if (Array.isArray(parsedObj[key])) return parsedObj[key];
        }
      }
    } catch {}
  }

  // 4. Fallback recovery: extract individual JSON objects { ... } that contain input/output/expected
  const objectMatches = text.match(/\{[\s\S]*?\}/g) || [];
  const recovered: any[] = [];
  for (const objStr of objectMatches) {
    try {
      const cleanedObj = objStr
        .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1')
        .replace(/,\s*}/g, '}');
      const obj = JSON.parse(cleanedObj);
      if (obj && typeof obj === 'object' && (obj.input !== undefined || obj.args !== undefined)) {
        recovered.push(obj);
      }
    } catch {}
  }

  return recovered;
}

export function sanitizeMarkdownForPrompt(markdown: string): string {
  if (!markdown) return '';
  return markdown
    // 1. Strip massive base64 images so they do not exhaust prompt tokens or crash the parser
    .replace(/!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)/gi, (_, alt) => `[Image: ${alt || 'Diagram'}]`)
    .replace(/src=["']data:image\/[^;]+;base64,[^"']*["']/gi, 'src="[embedded-image]"')
    // 2. Strip large SVG blocks
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '[Vector Diagram]')
    // 3. Replace regular markdown images ![alt](url) with a clean descriptive placeholder
    .replace(/!\[([^\]]*)\]\([^)]+\)/gi, (_, alt) => `[Image: ${alt || 'Diagram'}]`)
    // 4. Replace reference-style markdown images ![alt][ref]
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/gi, (_, alt) => `[Image: ${alt || 'Diagram'}]`)
    // 5. Replace HTML <img> / <picture> tags with [Image: alt]
    .replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, '[Image: Diagram]')
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const altMatch = tag.match(/alt=["']([^"']*)["']/i);
      return `[Image: ${altMatch?.[1] || 'Diagram'}]`;
    })
    // 6. Strip iframes / video embeds
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .trim();
}

// Format and strictly validate expected output string according to the declared return type
function formatExpectedForReturnType(raw: any, returnType: string): string {
  const rType = (returnType || '').trim().toLowerCase();
  
  if (typeof raw === 'boolean') {
    return raw ? 'true' : 'false';
  }

  if (typeof raw === 'number') {
    return String(raw);
  }

  const rawStr = typeof raw === 'string' ? raw.trim() : JSON.stringify(raw);

  // Boolean return type
  if (rType === 'bool' || rType === 'boolean') {
    if (rawStr.toLowerCase() === 'true') return 'true';
    if (rawStr.toLowerCase() === 'false') return 'false';
  }

  // Numeric return type (int, long, double, float)
  if (['int', 'long', 'double', 'float', 'number'].includes(rType)) {
    const num = Number(rawStr);
    if (!isNaN(num)) return String(num);
  }

  // String return type: must be wrapped in JSON quotes
  if (rType === 'string') {
    try {
      const parsed = JSON.parse(rawStr);
      if (typeof parsed === 'string') return rawStr;
    } catch {}
    return JSON.stringify(rawStr);
  }

  // Array / Matrix return type
  if (rType.endsWith('[]') || rType.startsWith('list') || rType.startsWith('array')) {
    try {
      const parsed = JSON.parse(rawStr);
      if (Array.isArray(parsed)) return rawStr;
    } catch {
      // Try wrapping comma-separated numbers/strings: "1, 2, 3" -> "[1, 2, 3]"
      const wrapped = `[${rawStr}]`;
      try {
        const parsed = JSON.parse(wrapped);
        if (Array.isArray(parsed)) return wrapped;
      } catch {}
    }
  }

  return rawStr;
}

export async function generateTestCases(
  problemTitle:       string,
  problemDescription: string,
  paramTypes:         string[],
  returnType:         string,
  existingCases:      GeneratedTestCase[],
  starterCode?:       string,
): Promise<GeneratedTestCase[]> {
  // Extract parameter names and types from starter code or generate defaults
  let paramNames: string[] = [];
  let inferredParamTypes: string[] = [];
  let inferredReturnType = '';

  if (starterCode) {
    // Try matching typed Python def: def solution(nums: List[int], target: int) -> List[int]:
    const pyMatch = starterCode.match(/def\s+\w+\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?/);
    if (pyMatch && pyMatch[1]) {
      const rawParams = pyMatch[1].split(',').map(p => p.trim()).filter(p => p && p !== 'self');
      paramNames = rawParams.map(p => p.split(':')[0].trim());
      inferredParamTypes = rawParams.map(p => {
        const parts = p.split(':');
        return parts.length > 1 ? parts[1].trim() : '';
      }).filter(Boolean);
      if (pyMatch[2]) {
        inferredReturnType = pyMatch[2].trim();
      }
    }
  }

  const cleanParamTypes = (Array.isArray(paramTypes) && paramTypes.length > 0)
    ? paramTypes.map(p => p.trim()).filter(Boolean)
    : inferredParamTypes;

  const cleanReturnType = (returnType && returnType.trim() !== 'bool')
    ? returnType.trim()
    : (inferredReturnType || returnType || 'bool').trim();

  if (!paramNames.length && cleanParamTypes.length) {
    paramNames = cleanParamTypes.map((_, i) => `arg${i + 1}`);
  }

  const signatureDesc = cleanParamTypes.length > 0
    ? `Function Signature & Strict Type Constraints:
- Expected Parameter Count: ${cleanParamTypes.length}
- Parameters:
${cleanParamTypes.map((type, i) => `  * Parameter ${i + 1} (${paramNames[i] || `arg${i + 1}`}): type "${type}"`).join('\n')}
- Expected Return Type: "${cleanReturnType}"
- Function Call Interface: solution(${cleanParamTypes.map((type, i) => `${paramNames[i] || `arg${i + 1}`}: ${type}`).join(', ')}) -> ${cleanReturnType}`
    : `Function Signature & Type Constraints:
- Parameters: [any]
- Expected Return Type: "${cleanReturnType}"`;

  const existingSummary = existingCases.length
    ? `Existing test cases (do NOT duplicate these):\n${existingCases.map(c => `  input: ${c.input} → expected: ${c.expected || c.output}${c.is_hidden ? ' (hidden)' : ''}`).join('\n')}`
    : 'No existing test cases yet.';

  const cleanedDesc = sanitizeMarkdownForPrompt(problemDescription || '');
  const markdownDesc = cleanedDesc.slice(0, 5000);

  const prompt = `Problem Title: "${problemTitle}"

Markdown Problem Description & Constraints:
${markdownDesc}

${signatureDesc}

${existingSummary}

Generate high-quality, comprehensive test cases for this problem based on the markdown description, constraints, and function signature.
Provide:
1. Basic / Example Cases (2): Standard typical inputs derived directly from the problem description and examples. Mark "is_hidden": false.
2. Edge Cases (2): Empty or single-element inputs, all identical values, minimum/maximum boundary constraints. Mark "is_hidden": true.
3. Stress / Non-Trivial Cases (2): Complex patterns, tricky cases that break naive greedy or brute-force approaches. Mark "is_hidden": true.
4. Boundary / Special Values (2): Negative numbers, zeros, special cases, or empty result scenarios. Mark "is_hidden": true.

CRITICAL INSTRUCTIONS ON MARKDOWN & IMAGES:
- The problem description may contain markdown formatting, mathematical symbols, and image references like \`[Image: ...]\`.
- Do NOT output any images, markdown formatting, or image links. Extract all logic, types, and constraints from the written text and signature.

CRITICAL SIGNATURE & TYPE COMPLIANCE:
- Every test case "input" MUST be a single valid JSON array string containing all function arguments in exact positional order.
  ${cleanParamTypes.length > 0 ? `* The outer JSON array MUST contain EXACTLY ${cleanParamTypes.length} elements corresponding to the parameters.` : ''}
  * Example for 2 parameters (nums: int[], target: int): "[[2,7,11,15], 9]"
  * Example for 1 parameter (s: string): "[\\"babad\\"]"
- Every test case "output" (or "expected") MUST be a valid JSON representation strictly matching the return type "${cleanReturnType}":
  * Numeric types (int, number, float, double): Must be valid JSON numbers, e.g. "42", "-1", "0" (never descriptive words).
  * Boolean types (bool, boolean): Must be "true" or "false".
  * String types (string, String): Must be valid JSON string with quotes, e.g. "\\"result\\"".
  * Array/List types: Must be a valid JSON array string, e.g. "[0, 1]" or "[]".
- "is_hidden": boolean (false for first 2 sample cases, true for remaining cases).
- "explanation": Short 1-sentence description of the edge case or condition tested.

OUTPUT FORMAT REQUIREMENTS:
- Output RAW JSON ONLY.
- Absolutely NO markdown code fences (no \`\`\` or \`\`\`json).
- Absolutely NO conversational filler, introductory remarks, or commentary.
- Must start with "[" as the very first character and end with "]" as the very last character.

Example Output:
[
  {"input": "[[1,2,1,3], 3]", "output": "1", "is_hidden": false, "explanation": "Basic sample with frequency count"},
  {"input": "[[5], 1]", "output": "5", "is_hidden": true, "explanation": "Single element boundary case"}
]`;

  const result = await callAI(
    prompt,
    1400,
    `You are an expert competitive programming test suite generator. Output raw JSON array ONLY (e.g. [{"input": "...", "output": "...", "is_hidden": false}]). Adhere strictly to the parameter count and types. Absolutely NO markdown code fences, NO conversational text, and NO preamble.`
  );

  if (isBlocked(result) || result.startsWith('AI error:')) {
    if (result.includes('NO_GROQ_KEY') || result.includes('Groq API key')) {
      throw new Error('Groq API Key is missing. Please set GROQ_API_KEY in your .env file or server environment.');
    }
    if (result.includes('GROQ_RATE_LIMIT') || result.includes('429')) {
      throw new Error('Groq AI rate limit reached (429). Please wait a moment and try again.');
    }
    if (result.includes('unavailable') || result.includes('ECONNREFUSED') || result.includes('fetch failed')) {
      throw new Error('AI service is currently unavailable. Please verify GROQ_API_KEY and network connection.');
    }
    throw new Error(result.replace(/^[⚠️⛔]\s*/, ''));
  }

  const parsed = extractJsonArray(result);
  if (!parsed || !parsed.length) {
    if (result.length < 30) {
      throw new Error('AI returned an empty or invalid response. Please try again.');
    }
    throw new Error(`Failed to parse AI output into a valid test case array. (Received: ${result.slice(0, 120)}...)`);
  }

  // Strict schema validation and signature compliance
  const validated: GeneratedTestCase[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item || typeof item !== 'object') continue;

    const rawInput = item.input !== undefined ? item.input : item.args;
    const rawExpected = item.output !== undefined ? item.output : item.expected;
    if (rawInput === undefined || rawExpected === undefined) continue;

    const normalizedInput = normalizeTestInput(String(rawInput));

    // Verify that input is valid JSON
    let testArgs: any;
    try {
      testArgs = JSON.parse(normalizedInput);
    } catch {
      continue;
    }

    // Ensure testArgs is an array representing function arguments
    if (!Array.isArray(testArgs)) {
      testArgs = [testArgs];
    }

    // Handle single parameter array cases where the LLM generated [1, 2, 3] instead of [[1, 2, 3]]
    if (cleanParamTypes.length === 1) {
      const singleType = cleanParamTypes[0].toLowerCase();
      const isArrayType = singleType.endsWith('[]') || singleType.startsWith('list') || singleType.startsWith('array');
      if (isArrayType && testArgs.length > 1 && !Array.isArray(testArgs[0])) {
        testArgs = [testArgs];
      }
    }

    // Verify parameter count compliance if specified
    if (cleanParamTypes.length > 0 && testArgs.length !== cleanParamTypes.length) {
      continue;
    }

    // Validate and coerce parameter types if specified
    let paramsValid = true;
    if (cleanParamTypes.length > 0) {
      for (let pIdx = 0; pIdx < cleanParamTypes.length; pIdx++) {
        const pType = cleanParamTypes[pIdx].trim().toLowerCase();
        const argVal = testArgs[pIdx];

        if (pType.endsWith('[]') || pType.startsWith('list')) {
          if (!Array.isArray(argVal)) {
            paramsValid = false;
            break;
          }
        } else if (['int', 'long', 'double', 'float', 'number'].includes(pType)) {
          if (typeof argVal !== 'number') {
            const num = Number(argVal);
            if (isNaN(num)) {
              paramsValid = false;
              break;
            }
            testArgs[pIdx] = num;
          }
        } else if (pType === 'bool' || pType === 'boolean') {
          if (typeof argVal !== 'boolean') {
            if (String(argVal).toLowerCase() === 'true') testArgs[pIdx] = true;
            else if (String(argVal).toLowerCase() === 'false') testArgs[pIdx] = false;
            else {
              paramsValid = false;
              break;
            }
          }
        } else if (pType === 'string') {
          if (typeof argVal !== 'string') {
            testArgs[pIdx] = String(argVal);
          }
        }
      }
    }

    if (!paramsValid) continue;

    // Normalize output for return type compliance
    const normalizedExpected = formatExpectedForReturnType(rawExpected, cleanReturnType);

    const isHidden = item.is_hidden !== undefined
      ? Boolean(item.is_hidden)
      : (item.hidden !== undefined ? Boolean(item.hidden) : i >= 2);

    validated.push({
      input: JSON.stringify(testArgs),
      expected: normalizedExpected,
      output: normalizedExpected,
      is_hidden: isHidden,
      explanation: typeof item.explanation === 'string' ? item.explanation : undefined,
    });
  }

  if (!validated.length) {
    const sigStr = cleanParamTypes.length > 0 ? `(${cleanParamTypes.join(', ')}) -> ${cleanReturnType}` : `any -> ${cleanReturnType}`;
    throw new Error(`AI generated ${parsed.length} test cases, but none passed strict signature verification for ${sigStr}. Please verify parameter types and description constraints.`);
  }

  return validated.slice(0, 10);
}

// Defensive normalizer: the platform (admin editor + executor) expects
// "input" to be a single valid JSON array of arguments, e.g. "[[2,7,11,15], 9]".
// If the model ever slips back into the old comma-separated form
// ("[2,7,11,15], 9") — which is NOT valid JSON on its own — wrap it so it
// still parses correctly instead of silently producing broken test cases.
function normalizeTestInput(input: string): string {
  const trimmed = input.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return trimmed; // already valid JSON array
    return JSON.stringify([parsed]);
  } catch {
    // Not valid JSON by itself — try wrapping in an outer array,
    // which is exactly what fixes "[2,7,11,15], 9" → "[[2,7,11,15], 9]"
    const wrapped = `[${trimmed}]`;
    try {
      JSON.parse(wrapped);
      return wrapped;
    } catch {
      return trimmed; // give up — leave as-is, admin can fix manually
    }
  }
}

// ── Admin Feature: Problem Description Improver ───────────────────────────────

export async function improveDescription(
  title:       string,
  roughDesc:   string,
  paramTypes:  string[],
  returnType:  string,
  example?:    string,
): Promise<string> {
  const result = await callAI(
    `Problem title: "${title}"
Parameter types: ${paramTypes.join(', ') || 'unknown'}
Return type: ${returnType}
${example ? `Example: ${example}` : ''}

Rough description from admin:
"${roughDesc}"

Rewrite this as a clean, professional competitive programming problem description in HTML.
Requirements:
- Clear problem statement (what to find/compute)
- Input format and constraints section
- Output format
- Use <p>, <ul>, <li>, <strong>, <code> tags only
- Keep it concise (under 200 words)
- Do NOT include the example (that's shown separately)
- Do NOT include a title (shown separately)

Output ONLY the HTML content, no markdown, no explanation.`,
    600,
    'You are a competitive programming problem writer. Write clear, precise problem statements. Output only HTML.',
  );

  // Strip any accidental markdown fences
  return result.replace(/```(?:html)?/g, '').trim();
}

// ── Admin Feature: AI Problem Generator ──────────────────────────────────────

export interface GeneratedProblem {
  title:       string;
  description: string;
  difficulty:  'Easy' | 'Medium' | 'Hard';
  points:      number;
  tags:        string[];
  example:     string;
  param_types: string[];
  return_type: string;
  hints:       string[];
  test_cases:  GeneratedTestCase[];
}

export async function generateFullProblem(concept: string): Promise<GeneratedProblem | null> {
  const result = await callAI(
    `Generate a complete coding problem about: "${concept}"

Output ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "title": "Problem Title",
  "description": "<p>Clear problem statement in HTML with <code>inline code</code> and constraints...</p>",
  "difficulty": "Easy|Medium|Hard",
  "points": 100,
  "tags": ["array", "hashmap"],
  "example": "Input: nums = [2,7,11,15], target = 9\\nOutput: [0,1]\\nExplanation: Because nums[0] + nums[1] == 9, we return [0, 1].",
  "param_types": ["int[]", "int"],
  "return_type": "int[]",
  "hints": ["Think about what complement each number needs", "A hashmap gives O(1) lookup"],
  "test_cases": [
    {"input": "[[2,7,11,15], 9]", "expected": "[0,1]", "is_hidden": false},
    {"input": "[[3,2,4], 6]", "expected": "[1,2]", "is_hidden": false},
    {"input": "[[3,3], 6]", "expected": "[0,1]", "is_hidden": true},
    {"input": "[[-1,-2,-3,-4,-5], -8]", "expected": "[2,4]", "is_hidden": true},
    {"input": "[[0,4,3,0], 0]", "expected": "[0,3]", "is_hidden": true}
  ]
}

Rules:
- description: HTML only, clear problem statement with constraints
- points: 50 for Easy, 100 for Medium, 200 for Hard
- param_types: array of Java-style types (int, int[], String, boolean, etc.)
- return_type: single Java-style type
- hints: exactly 2-3 progressive hints, no code
- test_cases: exactly 5 diverse test cases (first 2 is_hidden: false, remaining 3 is_hidden: true). Each "input" MUST be a single valid JSON array wrapping every argument in order.`,
    1000,
    'You are a competitive programming problem generator. Output ONLY valid JSON, where every test case "input" is itself a single valid JSON array of arguments, never a bare comma-separated list. No markdown, no explanation.',
  );

  if (isBlocked(result) || result.startsWith('AI error:')) {
    if (result.includes('NO_GROQ_KEY') || result.includes('Groq API key')) {
      throw new Error('Groq API Key is missing. Please set GROQ_API_KEY in your .env file or server environment.');
    }
    if (result.includes('GROQ_RATE_LIMIT') || result.includes('429')) {
      throw new Error('Groq AI rate limit reached (429). Please wait a moment and try again.');
    }
    if (result.includes('unavailable') || result.includes('ECONNREFUSED') || result.includes('fetch failed')) {
      throw new Error('AI service is currently unavailable. Please verify GROQ_API_KEY and network connection.');
    }
    throw new Error(result.replace(/^[⚠️⛔]\s*/, ''));
  }

  try {
    const cleaned = result.replace(/```(?:json)?/g, '').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No object found');
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed.test_cases)) {
      parsed.test_cases = parsed.test_cases.map((c: GeneratedTestCase, i: number) => ({
        ...c,
        input: normalizeTestInput(c.input),
        is_hidden: c.is_hidden !== undefined ? c.is_hidden : i >= 2,
      }));
    }
    return parsed as GeneratedProblem;
  } catch (err: any) {
    if (err.message && !err.message.includes('No object found') && !err.message.includes('Unexpected token')) {
      throw err;
    }
    throw new Error(`Failed to parse AI-generated problem JSON: ${err.message || 'Invalid format'}`);
  }
}

// ── Feature: Approach Validator ───────────────────────────────────────────────

export interface ApproachResult {
  verdict:    'correct' | 'partial' | 'wrong';
  summary:    string;   // one line e.g. "Your approach is correct but suboptimal"
  feedback:   string;   // 2-4 sentences of detail
  complexity: string;   // e.g. "O(n²) time, O(1) space"
  suggestion: string;   // optional nudge if wrong/partial
}

export async function validateApproach(
  problemTitle:       string,
  problemDescription: string,
  approach:           string,
): Promise<ApproachResult> {
  const errorResult: ApproachResult = {
    verdict: 'partial', summary: '', feedback: approach, complexity: '', suggestion: '',
  };

  const blocked = subscriberCheck();
  if (blocked) {
    errorResult.feedback = blocked;
    return errorResult;
  }

  if (!approach.trim() || approach.trim().length < 10) {
    errorResult.verdict  = 'partial';
    errorResult.feedback = 'Please describe your approach in more detail.';
    return errorResult;
  }

  const result = await callAI(
    `Problem: "${problemTitle}"
Description: ${problemDescription.replace(/<[^>]*>/g, '').slice(0, 600)}

Student's proposed approach:
"${approach}"

Evaluate whether this approach will correctly solve the problem.
Reply with ONLY a JSON object (no markdown, no explanation):
{
  "verdict": "correct|partial|wrong",
  "summary": "One line verdict e.g. Your approach is correct but O(n²)",
  "feedback": "2-4 sentences explaining why it works or doesn't",
  "complexity": "Time and space complexity of their approach e.g. O(n) time, O(n) space",
  "suggestion": "If wrong or partial: a one-sentence nudge. If correct: empty string"
}

verdict rules:
- "correct": approach will solve the problem correctly (may not be optimal)
- "partial": approach has the right idea but a flaw or missing case
- "wrong": approach will not solve the problem`,
    300,
    'You are a competitive programming judge. Evaluate the student approach objectively. Output ONLY valid JSON.',
  );

  try {
    const cleaned = result.replace(/```(?:json)?/g, '').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON');
    const parsed = JSON.parse(match[0]);
    return {
      verdict:    parsed.verdict    || 'partial',
      summary:    parsed.summary    || '',
      feedback:   parsed.feedback   || '',
      complexity: parsed.complexity || '',
      suggestion: parsed.suggestion || '',
    };
  } catch {
    errorResult.feedback = result;
    return errorResult;
  }
}

// ── Feature: Weekly Challenge Summary ────────────────────────────────────────

export interface ChallengeSummary {
  concept:       string;   // What concept/topic this week tested
  optimalApproach: string; // What the best approach was
  commonMistakes: string;  // What tripped most people up
  shoutout:      string;   // Mention of top finishers
  closing:       string;   // Motivational closing line
}

export async function generateChallengeSummary(
  challengeTitle: string,
  problems:       { title: string; difficulty: string; tags: string[] }[],
  topFinishers:   { name: string; github: string; points: number }[],
  totalParticipants: number,
): Promise<ChallengeSummary | null> {
  // AI features are subscriber-only — non-subscribers / signed-out users
  // simply don't get a generated summary (UI just shows nothing for them).
  if (subscriberCheck()) return null;

  const problemList = problems.map((p, i) =>
    `${i + 1}. "${p.title}" (${p.difficulty}) — tags: ${p.tags.join(', ') || 'none'}`
  ).join('\n');

  const topList = topFinishers.slice(0, 3).map((f, i) =>
    `${i + 1}. ${f.name} (@${f.github}) — ${f.points} pts`
  ).join('\n');

  const result = await callAI(
    `You are writing a post-challenge summary for a coding platform's weekly challenge.

Challenge: "${challengeTitle}"
Total participants: ${totalParticipants}

Problems this week:
${problemList}

Top finishers:
${topList || 'No finishers recorded yet'}

Write a friendly, engaging challenge summary. Output ONLY a JSON object:
{
  "concept": "1-2 sentences: what core CS concept/topic this challenge tested",
  "optimalApproach": "2-3 sentences: what the optimal approach was for the hardest problem",
  "commonMistakes": "1-2 sentences: what commonly trips people up on these types of problems",
  "shoutout": "1 sentence: enthusiastic shoutout to top 3 finishers by name",
  "closing": "1 sentence: motivational closing line encouraging people to keep practicing"
}`,
    400,
    'You are an enthusiastic coding community manager writing post-challenge summaries. Be friendly, specific, and encouraging. Output ONLY valid JSON.',
  );

  try {
    const cleaned = result.replace(/```(?:json)?/g, '').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON');
    return JSON.parse(match[0]) as ChallengeSummary;
  } catch {
    return null;
  }
}

// ── Feature: Spoiler Detection ────────────────────────────────────────────────

export interface SpoilerResult {
  isSpoiler:  boolean;
  confidence: 'high' | 'medium' | 'low';
  reason:     string;   // what specifically looks like a spoiler
  suggestion: string;   // how to rephrase without spoiling
}

export async function detectSpoiler(
  problemTitle: string,
  commentBody:  string,
): Promise<SpoilerResult> {
  // AI features are subscriber-only. Non-subscribers / signed-out users
  // skip the spoiler check silently (comment still posts normally) rather
  // than being blocked from commenting — but no AI call is made for them.
  if (subscriberCheck()) {
    return { isSpoiler: false, confidence: 'low', reason: '', suggestion: '' };
  }

  // Skip check for short comments — can't be a meaningful spoiler
  if (commentBody.trim().length < 30) {
    return { isSpoiler: false, confidence: 'low', reason: '', suggestion: '' };
  }

  const result = await callAI(
    `You are a discussion moderator for a coding platform.

Problem: "${problemTitle}"

Comment being posted:
"${commentBody}"

Determine if this comment contains a spoiler — meaning it reveals the complete solution,
full working code, or the exact algorithm that directly solves the problem.

A spoiler IS: complete code, step-by-step full solution, "here's how to solve it: [full answer]"
NOT a spoiler: conceptual hints, asking questions, discussing general approaches, pointing out an edge case, celebrating solving it

Output ONLY valid JSON:
{
  "isSpoiler": true/false,
  "confidence": "high/medium/low",
  "reason": "One sentence explaining what makes this a spoiler, or empty string if not",
  "suggestion": "One sentence on how to rephrase as a hint instead, or empty string if not spoiler"
}`,
    150,
    'You are a strict discussion moderator. Only flag clear, direct solution spoilers. Be conservative — when in doubt, do NOT flag. Output ONLY valid JSON.',
  );

  try {
    const cleaned = result.replace(/```(?:json)?/g, '').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON');
    const parsed = JSON.parse(match[0]);
    return {
      isSpoiler:  !!parsed.isSpoiler,
      confidence: parsed.confidence || 'low',
      reason:     parsed.reason     || '',
      suggestion: parsed.suggestion || '',
    };
  } catch {
    // If AI fails, allow the comment through
    return { isSpoiler: false, confidence: 'low', reason: '', suggestion: '' };
  }
}

// ── Admin Feature: Plagiarism Detector ───────────────────────────────────────

export interface PlagiarismResult {
  score:      number;   // 0-100 similarity score
  verdict:    'clean' | 'suspicious' | 'likely_plagiarised';
  matches:    string[]; // list of suspicious similarities found
  explanation: string; // 2-3 sentence explanation
}

export async function detectPlagiarism(
  submissionCode: string,
  lang:           string,
  otherSubmissions: { github: string; code: string }[],
): Promise<PlagiarismResult> {
  if (!otherSubmissions.length) {
    return { score: 0, verdict: 'clean', matches: [], explanation: 'No other submissions to compare against.' };
  }

  // Only compare against up to 5 other submissions to keep prompt short
  const comparisons = otherSubmissions.slice(0, 5).map((s, i) =>
    `Submission ${i + 1} by @${s.github}:\n\`\`\`${lang}\n${s.code.slice(0, 400)}\n\`\`\``
  ).join('\n\n');

  const result = await callAI(
    `You are a plagiarism detection system for a coding platform.

Language: ${lang}

Submission to check:
\`\`\`${lang}
${submissionCode.slice(0, 600)}
\`\`\`

Other submissions for the same problem:
${comparisons}

Compare the submission to check against the others. Look for:
- Identical or near-identical variable names and structure
- Same unusual approach or uncommon algorithm choice
- Copy-pasted logic with minor renaming
- Identical comments or spacing patterns

Note: Similar solutions are NORMAL for easy problems. Only flag if there are specific suspicious similarities beyond the obvious algorithmic approach.

Output ONLY valid JSON:
{
  "score": 0-100,
  "verdict": "clean|suspicious|likely_plagiarised",
  "matches": ["specific similarity 1", "specific similarity 2"],
  "explanation": "2-3 sentence explanation of findings"
}

score guide: 0-30 = clean, 31-60 = suspicious, 61-100 = likely plagiarised`,
    300,
    'You are a strict plagiarism detection system. Be conservative — only flag clear copying, not similar solutions. Output ONLY valid JSON.',
  );

  try {
    const cleaned = result.replace(/```(?:json)?/g, '').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON');
    const parsed = JSON.parse(match[0]);
    return {
      score:       Math.min(100, Math.max(0, Number(parsed.score) || 0)),
      verdict:     parsed.verdict     || 'clean',
      matches:     Array.isArray(parsed.matches) ? parsed.matches : [],
      explanation: parsed.explanation || '',
    };
  } catch {
    return { score: 0, verdict: 'clean', matches: [], explanation: 'Check failed — could not analyze.' };
  }
}
