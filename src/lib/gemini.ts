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

const GROQ_API_KEY  = process.env.NEXT_PUBLIC_GROQ_KEY ?? '';
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GROQ_TIMEOUT  = 8000; // ms — fall back to Ollama after this

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

// ── Core: Groq ────────────────────────────────────────────────────────────────

interface Msg { role: 'system' | 'user'; content: string; }

async function callGroq(messages: Msg[], maxTokens: number): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('NO_GROQ_KEY');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: maxTokens, temperature: 0.2 }),
      signal: controller.signal,
    });
    if (res.status === 429) throw new Error('GROQ_RATE_LIMIT');
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? '';
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

  // 1. Try Groq
  if (GROQ_API_KEY) {
    try {
      const result = await callGroq(messages, maxTokens);
      if (result) return result;
    } catch (e: any) {
      console.warn('Groq failed, trying Ollama:', e.message);
    }
  }

  // 2. Fallback: Ollama
  try {
    const result = await callOllama(messages, maxTokens);
    if (result) return result;
    return 'No response from AI.';
  } catch (e: any) {
    if (e.message?.includes('fetch failed') || e.message?.includes('ECONNREFUSED'))
      return '⚠️ AI is unavailable right now. Try again in a moment.';
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

// ── Feature 4: Problem Recommendations ───────────────────────────────────────

export async function getRecommendations(
  solvedTitles: string[], availableTitles: string[],
): Promise<string[]> {
  if (!availableTitles.length) return [];
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
    if (Array.isArray(parsed)) { incrementLocal('recommendations'); return parsed.slice(0, 3); }
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
  input:    string;
  expected: string;
}

export async function generateTestCases(
  problemTitle:       string,
  problemDescription: string,
  paramTypes:         string[],
  returnType:         string,
  existingCases:      GeneratedTestCase[],
): Promise<GeneratedTestCase[]> {
  const existingSummary = existingCases.length
    ? `Existing test cases (do NOT duplicate these):\n${existingCases.map(c => `  input: ${c.input} → expected: ${c.expected}`).join('\n')}`
    : 'No existing test cases yet.';

  const result = await callAI(
    `Problem: "${problemTitle}"
Description: ${problemDescription.replace(/<[^>]*>/g, '').slice(0, 800)}
Parameter types: ${paramTypes.join(', ') || 'unknown'}
Return type: ${returnType}

${existingSummary}

Generate 8 diverse test cases covering:
- Basic/typical cases (2)
- Edge cases: empty input, single element, all same values (2)
- Large/stress cases (1)
- Negative numbers or boundary values (1)
- Cases where the answer is 0, false, empty, or null (1)
- A tricky case that commonly trips up naive solutions (1)

CRITICAL FORMAT — respond with ONLY a JSON array, no markdown, no explanation:
[
  {"input": "[[2,7,11,15], 9]", "expected": "[0,1]"},
  {"input": "[[], 0]", "expected": "[]"}
]

Each "input" must be a SINGLE valid JSON array containing every argument in order — i.e. exactly
the format "[[2,7,11,15], 9]", NOT the comma-separated form "[2,7,11,15], 9" (that is invalid JSON
and will be rejected). If there is only one parameter, still wrap it in an outer array, e.g. "[5]".
Each "expected" must be valid JSON matching the return type.`,
    800,
    'You are a competitive programming test case generator. Output ONLY valid JSON array, where every "input" value is itself a single valid JSON array of arguments (e.g. "[[2,7,11,15], 9]"), never a bare comma-separated list. No markdown fences, no explanation, no extra text.',
  );

  try {
    const cleaned = result.replace(/```(?:json)?/g, '').trim();
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No array found');
    const parsed: GeneratedTestCase[] = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) throw new Error('Not an array');
    return parsed
      .filter(c => c.input !== undefined && c.expected !== undefined)
      .map(c => ({ ...c, input: normalizeTestInput(c.input) }))
      .slice(0, 10);
  } catch {
    return [];
  }
}

// Defensive normalizer: the platform (admin editor + executor) expects
// "input" to be a single valid JSON array of arguments, e.g. "[[2,7,11,15], 9]".
// If the model ever slips back into the old comma-separated form
// ("[2,7,11,15], 9") — which is NOT valid JSON on its own — wrap it so it
// still parses correctly instead of silently producing broken test cases.
function normalizeTestInput(input: string): string {
  const trimmed = input.trim();
  try {
    JSON.parse(trimmed);
    return trimmed; // already valid JSON as-is
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
  "description": "<p>Clear problem statement in HTML...</p>",
  "difficulty": "Easy|Medium|Hard",
  "points": 100,
  "tags": ["array", "hashmap"],
  "example": "Input: nums = [2,7,11,15], target = 9\\nOutput: [0,1]",
  "param_types": ["int[]", "int"],
  "return_type": "int[]",
  "hints": ["Think about what complement each number needs", "A hashmap gives O(1) lookup"],
  "test_cases": [
    {"input": "[[2,7,11,15], 9]", "expected": "[0,1]"},
    {"input": "[[3,2,4], 6]", "expected": "[1,2]"}
  ]
}

Rules:
- description: HTML only, clear problem statement with constraints
- points: 50 for Easy, 100 for Medium, 200 for Hard
- param_types: array of Java-style types (int, int[], String, boolean, etc.)
- return_type: single Java-style type
- hints: exactly 2-3 progressive hints, no code
- test_cases: exactly 5 diverse test cases. Each "input" MUST be a single valid JSON array
  wrapping every argument in order (e.g. "[[2,7,11,15], 9]"), never the bare comma-separated
  form "[2,7,11,15], 9" — that is not valid JSON and will break execution. A single-argument
  problem still needs the outer array, e.g. "[5]".`,
    1000,
    'You are a competitive programming problem generator. Output ONLY valid JSON, where every test case "input" is itself a single valid JSON array of arguments, never a bare comma-separated list. No markdown, no explanation.',
  );

  try {
    const cleaned = result.replace(/```(?:json)?/g, '').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No object found');
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed.test_cases)) {
      parsed.test_cases = parsed.test_cases.map((c: GeneratedTestCase) => ({
        ...c,
        input: normalizeTestInput(c.input),
      }));
    }
    return parsed as GeneratedProblem;
  } catch {
    return null;
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