export type JudgeLanguage =
  | 'python'
  | 'javascript'
  | 'cpp'
  | 'java'
  | 'go'
  | 'rust';

export interface JudgeSubmissionRequest {
  source_code: string;
  language_id: number;
  stdin?: string;
  expected_output?: string;
  cpu_time_limit?: number;
  wall_time_limit?: number;
  memory_limit?: number;
}

export interface JudgeStatus {
  id: number;
  description: string;
}

export interface JudgeSubmissionResponse {
  token: string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
  status?: JudgeStatus;
}

export const JUDGE0_LANGUAGE_MAP: Record<JudgeLanguage, number> = {
  python: 71,     // Python (3.8.1)
  javascript: 63, // JavaScript (Node.js 12.14.0)
  cpp: 54,        // C++ (GCC 9.2.0)
  java: 62,       // Java (OpenJDK 13.0.1)
  go: 60,         // Go (1.13.5)
  rust: 73,       // Rust (1.40.0)
};
