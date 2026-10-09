import {
  JudgeLanguage,
  JudgeSubmissionRequest,
  JudgeSubmissionResponse,
  JUDGE0_LANGUAGE_MAP,
} from './types';

const JUDGE0_BASE_URL = (
  process.env.JUDGE0_URL ||
  process.env.NEXT_PUBLIC_JUDGE0_URL ||
  'http://localhost:2358'
).replace(/\/$/, '');

const JUDGE0_AUTH_TOKEN = process.env.JUDGE0_AUTH_TOKEN || '';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (JUDGE0_AUTH_TOKEN) {
    headers['X-Auth-Token'] = JUDGE0_AUTH_TOKEN;
  }
  return headers;
}

/**
 * Submits code to Judge0 for execution with synchronous wait or polling fallback.
 */
export async function executeCode(
  sourceCode: string,
  language: JudgeLanguage | string,
  stdin: string = '',
  timeoutSeconds: number = 10
): Promise<{ stdout: string; stderr: string; time?: string; memory?: number }> {
  const languageId =
    JUDGE0_LANGUAGE_MAP[language as JudgeLanguage] ||
    JUDGE0_LANGUAGE_MAP.python;

  const payload: JudgeSubmissionRequest = {
    source_code: sourceCode,
    language_id: languageId,
    stdin,
    cpu_time_limit: timeoutSeconds,
    wall_time_limit: timeoutSeconds + 5,
  };

  try {
    // 1. Try synchronous submission with wait=true
    const submitUrl = `${JUDGE0_BASE_URL}/submissions?wait=true`;
    const res = await fetch(submitUrl, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout((timeoutSeconds + 10) * 1000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Judge0 error (${res.status}): ${errText || res.statusText}`);
    }

    const data: JudgeSubmissionResponse = await res.json();

    // If still in queue or processing, poll by token
    if (data.status && (data.status.id === 1 || data.status.id === 2)) {
      return await pollSubmission(data.token, timeoutSeconds);
    }

    const stdout = data.stdout ?? '';
    const stderr = (data.stderr ?? '') + (data.compile_output ?? '') + (data.message ?? '');

    return {
      stdout,
      stderr,
      time: data.time ?? undefined,
      memory: data.memory ?? undefined,
    };
  } catch (err: any) {
    if (err.message?.includes('fetch failed') || err.message?.includes('ECONNREFUSED')) {
      throw new Error(`Judge0 is not reachable at ${JUDGE0_BASE_URL}. Ensure Judge0 is running.`);
    }
    throw err;
  }
}

/**
 * Polls for submission status if async processing was triggered.
 */
async function pollSubmission(
  token: string,
  timeoutSeconds: number
): Promise<{ stdout: string; stderr: string; time?: string; memory?: number }> {
  const startTime = Date.now();
  const maxWaitMs = (timeoutSeconds + 10) * 1000;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 500));

    const pollUrl = `${JUDGE0_BASE_URL}/submissions/${token}`;
    const res = await fetch(pollUrl, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!res.ok) continue;

    const data: JudgeSubmissionResponse = await res.json();
    if (data.status && data.status.id > 2) {
      // Completed, error, or timed out
      const stdout = data.stdout ?? '';
      const stderr = (data.stderr ?? '') + (data.compile_output ?? '') + (data.message ?? '');
      return {
        stdout,
        stderr,
        time: data.time ?? undefined,
        memory: data.memory ?? undefined,
      };
    }
  }

  throw new Error('Execution timed out while polling Judge0.');
}
