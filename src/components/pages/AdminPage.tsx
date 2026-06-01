"use client";
// ════════════════════════════════════════════════════════════
// src/components/pages/AdminPage.tsx
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  User,
  Submission,
  Problem,
  Member,
  Contest,
  ContestRegistration,
  ArenaSubmission,
  Difficulty,
  WeeklyChallenge,
  WeeklyAccess,
} from "@/types/database";

type Section =
  | "overview"
  | "submissions"
  | "arena"
  | "problems"
  | "members"
  | "contests"
  | "weekly";

const blankProblem = (): Omit<Problem, "id" | "created_at" | "updated_at"> => ({
  title: "",
  difficulty: "Easy",
  points: 100,
  tags: [],
  description: "",
  example: "",
  starter_code: "",
  param_types: [],
  return_type: "bool",
  test_cases: [],
  submission_count: 0,
});

const blankContest = (): Omit<Contest, "id" | "created_at"> => ({
  name: "",
  entry_fee: 50,
  duration_mins: 60,
  upi_id: "",
  prize_note: "",
  leaderboard_discount: 0,
  problem_id: null,
  problem_ids: [],
  status: "upcoming",
});

function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (t: string[]) => void;
}) {
  const [input, setInput] = useState("");
  function add() {
    const v = input.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1 bg-[#1a1a1a] text-[#888] text-xs font-mono px-2 py-0.5 rounded"
          >
            {t}
            <button
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="text-[#444] hover:text-[#ff4d4d] ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Add tag & press Enter"
          className="flex-1 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40]"
        />
        <button
          onClick={add}
          className="px-3 py-1.5 bg-[#00e87a20] text-[#00e87a] text-xs font-mono rounded-lg hover:bg-[#00e87a30]"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

function TestCaseEditor({
  cases,
  onChange,
}: {
  cases: { input: string; expected: string }[];
  onChange: (tc: { input: string; expected: string }[]) => void;
}) {
  function upd(i: number, f: "input" | "expected", v: string) {
    const n = [...cases];
    n[i] = { ...n[i], [f]: v };
    onChange(n);
  }
  return (
    <div className="space-y-2">
      {cases.map((tc, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[#444] font-mono uppercase">
                Input{" "}
                <span className="normal-case text-[#333]">
                  (JSON array of args)
                </span>
              </label>
              <textarea
                value={tc.input}
                onChange={(e) => upd(i, "input", e.target.value)}
                rows={2}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs font-mono text-[#e0e0e0] resize-none focus:outline-none focus:border-[#00e87a40]"
                placeholder="JSON args e.g. [[2,7,11,15], 9]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#444] font-mono uppercase">
                Expected
              </label>
              <textarea
                value={tc.expected}
                onChange={(e) => upd(i, "expected", e.target.value)}
                rows={2}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs font-mono text-[#e0e0e0] resize-none focus:outline-none focus:border-[#00e87a40]"
                placeholder="JSON value e.g. [0,1] or true or 42"
              />
            </div>
          </div>
          <button
            onClick={() => onChange(cases.filter((_, idx) => idx !== i))}
            className="mt-4 text-[#444] hover:text-[#ff4d4d] text-lg leading-none font-mono"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...cases, { input: "", expected: "" }])}
        className="w-full py-1.5 border border-dashed border-[#2a2a2a] text-[#444] hover:text-[#00e87a] hover:border-[#00e87a40] text-xs font-mono rounded-lg transition-all"
      >
        + Add Test Case
      </button>
    </div>
  );
}

function ProblemForm({
  initial,
  onSave,
  onCancel,
  compact = false,
}: {
  initial: Partial<Problem>;
  onSave: (
    p: Omit<Problem, "id" | "created_at" | "updated_at">,
  ) => Promise<void>;
  onCancel: () => void;
  compact?: boolean;
}) {
  const [form, setForm] = useState<
    Omit<Problem, "id" | "created_at" | "updated_at">
  >({
    ...blankProblem(),
    ...initial,
    test_cases: initial.test_cases || [],
    tags: initial.tags || [],
    param_types: initial.param_types || [],
    return_type: initial.return_type || "bool",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setErr("Title is required.");
      return;
    }
    if (!form.description.trim()) {
      setErr("Description is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
    } catch (e: any) {
      setErr(e.message || "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {err && (
        <div className="text-xs text-[#ff4d4d] font-mono bg-[#ff4d4d10] px-3 py-2 rounded-lg border border-[#ff4d4d20]">
          {err}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs text-[#666] font-mono mb-1 uppercase tracking-wider">
            Title *
          </label>
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40]"
            placeholder="Two Sum"
          />
        </div>
        <div>
          <label className="block text-xs text-[#666] font-mono mb-1 uppercase tracking-wider">
            Points
          </label>
          <input
            type="number"
            aria-label="Points"
            value={form.points}
            onChange={(e) => set("points", Number(e.target.value))}
            className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-[#666] font-mono mb-2 uppercase tracking-wider">
          Difficulty
        </label>
        <div className="flex gap-2">
          {(["Easy", "Medium", "Hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => set("difficulty", d)}
              className={`px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition-all
                ${form.difficulty === d ? (d === "Easy" ? "bg-[#00e87a] text-black" : d === "Medium" ? "bg-[#f0b429] text-black" : "bg-[#ff4d4d] text-white") : "bg-[#1a1a1a] text-[#666] hover:text-[#e0e0e0]"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs text-[#666] font-mono mb-2 uppercase tracking-wider">
          Tags
        </label>
        <TagInput tags={form.tags} onChange={(t) => set("tags", t)} />
      </div>
      <div>
        <label className="block text-xs text-[#666] font-mono mb-1 uppercase tracking-wider">
          Description * (HTML)
        </label>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={compact ? 3 : 5}
          className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e0e0e0] placeholder-[#333] resize-y focus:outline-none focus:border-[#00e87a40]"
          placeholder="<p>Given an array of integers...</p>"
        />
      </div>
      <div>
        <label className="block text-xs text-[#666] font-mono mb-1 uppercase tracking-wider">
          Example
        </label>
        <textarea
          value={form.example}
          onChange={(e) => set("example", e.target.value)}
          rows={3}
          className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e0e0e0] placeholder-[#333] resize-y focus:outline-none focus:border-[#00e87a40]"
          placeholder={"Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]"}
        />
      </div>
      <div>
        <label className="block text-xs text-[#666] font-mono mb-1 uppercase tracking-wider">
          Starter Code (Python)
        </label>
        <div>
          <label className="block text-xs text-[#666] font-mono mb-1 uppercase tracking-wider">
            Parameter Types
          </label>
          <input
            value={form.param_types.join(",")}
            onChange={(e) =>
              set(
                "param_types",
                e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              )
            }
            className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
            placeholder="string,int[],int"
          />
        </div>
        <div>
          <label className="block text-xs text-[#666] font-mono mb-1 uppercase tracking-wider">
            Return Type
          </label>
          <select
            value={form.return_type}
            onChange={(e) => set("return_type", e.target.value)}
            className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
          >
            <option value="bool">bool</option>
            <option value="int">int</option>
            <option value="string">string</option>
            <option value="int[]">int[]</option>
            <option value="string[]">string[]</option>
          </select>
        </div>
        <textarea
          value={form.starter_code}
          onChange={(e) => set("starter_code", e.target.value)}
          rows={4}
          className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e0e0e0] placeholder-[#333] resize-y focus:outline-none focus:border-[#00e87a40]"
          placeholder={"def solution(nums, target):\n    pass"}
        />
      </div>
      <div>
        <label className="block text-xs text-[#666] font-mono mb-2 uppercase tracking-wider">
          Test Cases
        </label>
        <TestCaseEditor
          cases={form.test_cases}
          onChange={(tc) => set("test_cases", tc)}
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : initial.id
              ? "Update Problem"
              : "Create Problem"}
        </button>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ContestForm({
  initial,
  problems,
  onSave,
  onCancel,
  onProblemCreated,
}: {
  initial: Partial<Contest>;
  problems: Problem[];
  onSave: (c: Omit<Contest, "id" | "created_at">) => Promise<void>;
  onCancel: () => void;
  onProblemCreated: (p: Problem) => void;
}) {
  const db = getSupabaseClient();
  const [form, setForm] = useState<Omit<Contest, "id" | "created_at">>({
    ...blankContest(),
    ...initial,
    problem_ids: (initial as any).problem_ids || [],
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [showInlineProblem, setShowInlineProblem] = useState(false);
  const [creatingProblem, setCreatingProblem] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleProblemId(id: string) {
    setForm((f) => {
      const ids = f.problem_ids || [];
      return {
        ...f,
        problem_ids: ids.includes(id)
          ? ids.filter((x) => x !== id)
          : [...ids, id],
        problem_id: ids.includes(id)
          ? ids.filter((x) => x !== id)[0] || null
          : f.problem_ids?.length === 0
            ? id
            : f.problem_id,
      };
    });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setErr("Contest name is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await onSave(form);
    } catch (e: any) {
      setErr(e.message || "Save failed");
      setSaving(false);
    }
  }

  async function handleInlineProblemSave(
    problemData: Omit<Problem, "id" | "created_at" | "updated_at">,
  ) {
    setCreatingProblem(true);
    const payload = { ...problemData, is_contest_problem: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db.from("problems") as any)
      .insert([payload])
      .select()
      .single();
    setCreatingProblem(false);
    if (error) throw new Error((error as any).message);
    const newProb = data as Problem;
    onProblemCreated(newProb);
    setForm((f) => ({
      ...f,
      problem_ids: [...(f.problem_ids || []), newProb.id],
      problem_id: f.problem_id || newProb.id,
    }));
    setShowInlineProblem(false);
  }

  const selectedIds = form.problem_ids || [];

  return (
    <div className="space-y-5">
      {err && (
        <div className="text-xs text-[#ff4d4d] font-mono bg-[#ff4d4d10] px-3 py-2 rounded-lg border border-[#ff4d4d20]">
          {err}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            label: "Contest Name *",
            key: "name",
            ph: "BitByBit Weekly #1",
            type: "text",
          },
          {
            label: "Entry Fee (₹)",
            key: "entry_fee",
            ph: "50",
            type: "number",
          },
          {
            label: "Duration (min)",
            key: "duration_mins",
            ph: "60",
            type: "number",
          },
          {
            label: "Prize Note",
            key: "prize_note",
            ph: "Top 3 split the pool",
            type: "text",
          },
          { label: "UPI ID", key: "upi_id", ph: "yourname@upi", type: "text" },
        ].map(({ label, key, ph, type }) => (
          <div key={key}>
            <label className="block text-xs text-[#666] font-mono mb-1 uppercase tracking-wider">
              {label}
            </label>
            <input
              type={type}
              value={(form as any)[key]}
              onChange={(e) =>
                set(
                  key as any,
                  type === "number" ? Number(e.target.value) : e.target.value,
                )
              }
              className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40]"
              placeholder={ph}
            />
          </div>
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[#666] font-mono uppercase tracking-wider">
            Contest Problems ({selectedIds.length} selected)
          </label>
          <button
            onClick={() => setShowInlineProblem((v) => !v)}
            className="px-3 py-1 bg-[#00e87a15] text-[#00e87a] text-xs font-mono rounded-lg hover:bg-[#00e87a25] border border-[#00e87a30] transition-all"
          >
            {showInlineProblem ? "✕ Cancel" : "+ Create New"}
          </button>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-2">
          {problems.length === 0 ? (
            <div className="text-xs text-[#444] font-mono py-2 text-center">
              No problems yet — create one below
            </div>
          ) : (
            problems.map((p) => {
              const checked = selectedIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all ${checked ? "bg-[#00e87a10] border border-[#00e87a20]" : "hover:bg-[#111]"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProblemId(p.id)}
                    className="accent-[#00e87a] w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-sm font-mono text-[#e0e0e0] truncate flex-1">
                    {p.title}
                  </span>
                  <span
                    className={`text-[10px] font-mono shrink-0 ${p.difficulty === "Easy" ? "text-[#00e87a]" : p.difficulty === "Medium" ? "text-[#f0b429]" : "text-[#ff4d4d]"}`}
                  >
                    {p.difficulty}
                  </span>
                  {p.is_contest_problem && (
                    <span className="text-[10px] font-mono text-[#a78bfa] shrink-0">
                      arena
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
        {selectedIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedIds.map((id, i) => {
              const p = problems.find((x) => x.id === id);
              return (
                <span
                  key={id}
                  className="flex items-center gap-1 bg-[#00e87a15] text-[#00e87a] text-xs font-mono px-2 py-0.5 rounded border border-[#00e87a20]"
                >
                  P{i + 1}: {p?.title || id.slice(0, 8)}
                  <button
                    onClick={() => toggleProblemId(id)}
                    className="text-[#00e87a60] hover:text-[#ff4d4d] ml-0.5"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
        {showInlineProblem && (
          <div className="mt-4 p-4 bg-[#0a0a0a] border border-[#00e87a20] rounded-xl">
            <div className="text-xs text-[#00e87a] font-mono font-bold mb-1 uppercase tracking-wider">
              ✦ Create Arena Problem (hidden from public Problems page)
            </div>
            <p className="text-[10px] text-[#444] font-mono mb-4">
              This problem will be marked arena-only and won't appear in the
              Problems tab.
            </p>
            <ProblemForm
              initial={{}}
              onSave={handleInlineProblemSave}
              onCancel={() => setShowInlineProblem(false)}
              compact
            />
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs text-[#666] font-mono mb-2 uppercase tracking-wider">
          Status
        </label>
        <div className="flex gap-2">
          {(["upcoming", "live", "ended"] as const).map((s) => (
            <button
              key={s}
              onClick={() => set("status", s)}
              className={`px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition-all capitalize
                ${form.status === s ? (s === "live" ? "bg-[#00e87a] text-black" : s === "upcoming" ? "bg-[#f0b429] text-black" : "bg-[#333] text-[#e0e0e0]") : "bg-[#1a1a1a] text-[#666] hover:text-[#e0e0e0]"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving || creatingProblem}
          className="btn-primary disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : initial.id
              ? "Update Contest"
              : "Create Contest"}
        </button>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

function CodeViewer({ code, lang }: { code: string; lang: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n");
  const hasMore = lines.length > 6;
  const display = expanded ? code : lines.slice(0, 6).join("\n");

  function copy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="mt-2 bg-[#080808] border border-[#1a1a1a] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a1a1a] bg-[#0d0d0d]">
        <span className="text-[10px] font-mono text-[#444] uppercase tracking-wider">
          {lang}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={copy}
            className="text-[10px] font-mono text-[#555] hover:text-[#00e87a] transition-colors"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
          {hasMore && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] font-mono text-[#00e87a] hover:text-[#00ff88]"
            >
              {expanded ? "▲ Collapse" : `▼ Show all ${lines.length} lines`}
            </button>
          )}
        </div>
      </div>
      <pre className="text-xs font-mono text-[#a0a0a0] p-3 overflow-x-auto whitespace-pre leading-relaxed max-h-[480px] overflow-y-auto">
        {display}
        {!expanded && hasMore && (
          <span className="text-[#2a2a2a]">
            {"\n"} ⋯ {lines.length - 6} more lines
          </span>
        )}
      </pre>
    </div>
  );
}

interface ModalState {
  type:
    | "approve-sub"
    | "reject-sub"
    | "approve-arena"
    | "reject-arena"
    | "reject-reg"
    | "confirm-delete"
    | null;
  id: string;
  github: string;
  suggestedPoints?: number;
  arenaSubRef?: ArenaSubmission;
  basePoints?: number;
  confirmMsg?: string;
  onConfirmDelete?: () => void;
}

function ActionModal({
  modal,
  onConfirm,
  onCancel,
}: {
  modal: ModalState;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const isApprove =
    modal.type === "approve-sub" || modal.type === "approve-arena";

  useEffect(() => {
    if (modal.type === "approve-sub")
      setValue(String(modal.suggestedPoints ?? 100));
    if (modal.type === "approve-arena") {
      const sub = modal.arenaSubRef!;
      const strikeFactor = Math.max(0, 1 - (sub.strikes || 0) * 0.1);
      const timeFactor = sub.strike_penalty_factor || 1;
      const suggested = Math.max(
        10,
        Math.floor((modal.basePoints ?? 100) * strikeFactor * timeFactor),
      );
      setValue(String(suggested));
    }
    if (
      modal.type === "reject-sub" ||
      modal.type === "reject-arena" ||
      modal.type === "reject-reg"
    )
      setValue("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal.type, modal.id]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (modal.type === "confirm-delete") {
      onConfirm("confirmed");
      return;
    }
    onConfirm(value);
  }

  const title =
    modal.type === "approve-sub"
      ? `Approve submission — @${modal.github}`
      : modal.type === "reject-sub"
        ? `Reject submission — @${modal.github}`
        : modal.type === "approve-arena"
          ? `Approve arena entry — @${modal.github}`
          : modal.type === "reject-arena"
            ? `Disqualify entry — @${modal.github}`
            : modal.type === "reject-reg"
              ? `Reject registration — @${modal.github}`
              : modal.type === "confirm-delete"
                ? "Confirm Delete"
                : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative bg-[#111] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-display font-bold text-[#e0e0e0] mb-1 text-base">
          {title}
        </h3>
        {isApprove && (
          <p className="text-xs text-[#555] font-mono mb-4">
            Points are auto-calculated from test results. Adjust before
            confirming.
          </p>
        )}
        {modal.type === "approve-arena" && modal.arenaSubRef && (
          <div className="mb-3 p-2.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg text-xs font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-[#444]">Strikes</span>
              <span className="text-[#f0b429]">
                {modal.arenaSubRef.strikes}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#444]">Time factor</span>
              <span className="text-[#a78bfa]">
                {(modal.arenaSubRef.strike_penalty_factor || 1).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#444]">Base pts</span>
              <span className="text-[#e0e0e0]">{modal.basePoints}</span>
            </div>
          </div>
        )}
        {modal.type === "confirm-delete" && (
          <p className="text-xs text-[#666] font-mono mb-4">
            {modal.confirmMsg}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          {isApprove && (
            <div>
              <label className="block text-[10px] text-[#444] font-mono uppercase mb-1">
                Points to award
              </label>
              <input
                autoFocus
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-label="Enter quantity"
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a60]"
              />
            </div>
          )}
          {(modal.type === "reject-sub" ||
            modal.type === "reject-arena" ||
            modal.type === "reject-reg") && (
            <div>
              <label className="block text-[10px] text-[#444] font-mono uppercase mb-1">
                Reason{" "}
                <span className="normal-case text-[#333]">(optional)</span>
              </label>
              <input
                autoFocus
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Does not meet requirements"
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] placeholder-[#2a2a2a] focus:outline-none focus:border-[#ff4d4d40]"
              />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold transition-all
                ${isApprove ? "bg-[#00e87a] text-black hover:bg-[#00ff88]" : "bg-[#ff4d4d20] text-[#ff4d4d] hover:bg-[#ff4d4d30] border border-[#ff4d4d20]"}`}
            >
              {isApprove
                ? "✓ Confirm Approval"
                : modal.type === "confirm-delete"
                  ? "🗑 Delete"
                  : "✗ Confirm"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-xs font-mono text-[#444] hover:text-[#888] transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AdminPageProps {
  user: User;
}

export default function AdminPage({ user }: AdminPageProps) {
  const db = getSupabaseClient();
  const [section, setSection] = useState<Section>("overview");
  const [subs, setSubs] = useState<Submission[]>([]);
  const [arenaSubs, setArenaSubs] = useState<ArenaSubmission[]>([]);
  const [probs, setProbs] = useState<Problem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [regs, setRegs] = useState<ContestRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null);
  const [showContestForm, setShowContestForm] = useState(false);
  const [editingContest, setEditingContest] = useState<Contest | null>(null);

  const [modal, setModal] = useState<ModalState>({
    type: null,
    id: "",
    github: "",
  });
  const modalResolve = useRef<((v: string) => void) | null>(null);

  function openModal(
    m: Omit<ModalState, "type"> & { type: NonNullable<ModalState["type"]> },
  ): Promise<string | null> {
    return new Promise((resolve) => {
      modalResolve.current = resolve;
      setModal(m);
    });
  }
  function closeModal(value: string) {
    modalResolve.current?.(value);
    modalResolve.current = null;
    setModal({ type: null, id: "", github: "" });
  }
  function cancelModal() {
    modalResolve.current?.(null as any);
    modalResolve.current = null;
    setModal({ type: null, id: "", github: "" });
  }
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function loadAll() {
    setLoading(true);
    const [
      { data: s },
      { data: a },
      { data: p },
      { data: m },
      { data: c },
      { data: r },
    ] = await Promise.all([
      db
        .from("submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("arena_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      db.from("problems").select("*").order("created_at", { ascending: false }),
      db
        .from("members")
        .select("*")
        .order("total_points", { ascending: false }),
      db.from("contests").select("*").order("created_at", { ascending: false }),
      db
        .from("contest_registrations")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    setSubs(s || []);
    setArenaSubs((a as ArenaSubmission[]) || []);
    setProbs(p || []);
    setMembers(m || []);
    setContests(c || []);
    setRegs((r as ContestRegistration[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!user.is_admin) return;
    loadAll();
    const channel = db
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions" },
        async () => {
          const { data } = await db
            .from("submissions")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200);
          setSubs(data || []);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "arena_submissions" },
        async () => {
          const { data } = await db
            .from("arena_submissions")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200);
          setArenaSubs((data as ArenaSubmission[]) || []);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members" },
        async () => {
          const { data } = await db
            .from("members")
            .select("*")
            .order("total_points", { ascending: false });
          setMembers(data || []);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contest_registrations" },
        async () => {
          const { data } = await db
            .from("contest_registrations")
            .select("*")
            .order("created_at", { ascending: false });
          setRegs((data as ContestRegistration[]) || []);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contests" },
        async () => {
          const { data } = await db
            .from("contests")
            .select("*")
            .order("created_at", { ascending: false });
          setContests(data || []);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "problems" },
        async () => {
          const { data } = await db
            .from("problems")
            .select("*")
            .order("created_at", { ascending: false });
          setProbs(data || []);
        },
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, []);

  // ── FIX: fresh DB check — prevents double-approval if two admin tabs open ──
  async function approveSubmission(
    id: string,
    github: string,
    suggestedPoints: number,
  ) {
    const { data: freshSub } = await db
      .from("submissions")
      .select("status")
      .eq("id", id)
      .maybeSingle<{ status: string }>();
    if (freshSub?.status === "approved") {
      showToast("Already approved.");
      return;
    }

    const input = await openModal({
      type: "approve-sub",
      id,
      github,
      suggestedPoints,
    });
    if (input === null) return;
    const points = Math.max(0, parseInt(input as string, 10) || 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("submissions") as any)
      .update({ status: "approved", points_awarded: points })
      .eq("id", id);
    await awardPoints(github, points, false, undefined, true); // countAsSolved=true
    setSubs((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: "approved" as const, points_awarded: points }
          : s,
      ),
    );
    showToast(`✓ Approved — ${points} pts to @${github}`);
  }

  async function rejectSubmission(id: string, github: string) {
    const reason = await openModal({ type: "reject-sub", id, github });
    if (reason === null) return;
    const finalReason =
      (reason as string).trim() || "Does not meet requirements";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("submissions") as any)
      .update({ status: "rejected", reject_reason: finalReason })
      .eq("id", id);
    setSubs((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: "rejected" as const, reject_reason: finalReason }
          : s,
      ),
    );
    showToast(`✗ Rejected submission for @${github}`);
  }

  // ── FIX: fresh DB check for arena too ──
  async function approveArenaSubmission(
    sub: ArenaSubmission,
    basePoints: number,
  ) {
    const { data: freshArena } = await db
      .from("arena_submissions")
      .select("status")
      .eq("id", sub.id)
      .maybeSingle<{ status: string }>();
    if (freshArena?.status === "reviewed") {
      showToast("Already reviewed.");
      return;
    }

    const finalStr = await openModal({
      type: "approve-arena",
      id: sub.id,
      github: sub.github,
      arenaSubRef: sub,
      basePoints,
    });
    if (finalStr === null) return;
    const finalPts = Math.max(0, parseInt(finalStr as string, 10) || 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("arena_submissions") as any)
      .update({ status: "reviewed", points_awarded: finalPts })
      .eq("id", sub.id);
    await awardPoints(
      sub.github,
      finalPts,
      true,
      sub.contest_id ?? undefined,
      false,
    ); // FIX: countAsSolved=false

    setArenaSubs((prev) =>
      prev.map((a) =>
        a.id === sub.id
          ? { ...a, status: "reviewed" as const, points_awarded: finalPts }
          : a,
      ),
    );
    const contest = contests.find((c) => c.id === sub.contest_id);
    const discount = contest?.leaderboard_discount ?? 0;
    showToast(
      `✓ Arena approved — ${finalPts} pts to @${sub.github}${discount > 0 ? ` (${discount}% leaderboard discount applied)` : ""}`,
    );
  }

  async function rejectArenaSubmission(id: string, github: string) {
    const reason = await openModal({ type: "reject-arena", id, github });
    if (reason === null) return;
    const finalReason =
      (reason as string).trim() || "Did not meet requirements";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("arena_submissions") as any)
      .update({ status: "disqualified", strike_penalty_factor: 0 })
      .eq("id", id);
    setArenaSubs((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: "disqualified" as const } : a,
      ),
    );
    showToast(`✗ Arena rejected for @${github}: ${finalReason}`);
  }

  // ── FIX: countAsSolved param — arena passes false so problems_solved & streak stay clean ──
  async function awardPoints(
    github: string,
    points: number,
    isContest = false,
    contestId?: string,
    countAsSolved = true,
  ) {
    let effectivePoints = points;
    if (isContest && contestId) {
      const contest = contests.find((c) => c.id === contestId);
      const discount = contest?.leaderboard_discount ?? 0;
      if (discount > 0) {
        const { data: memberCheck } = await db
          .from("members")
          .select("total_points")
          .eq("github", github)
          .maybeSingle<{ total_points: number }>();
        if (memberCheck && memberCheck.total_points > 0)
          effectivePoints = Math.floor(points * (1 - discount / 100));
      }
    }
    const now = new Date();
    const { data: ex } = await db
      .from("members")
      .select("*")
      .eq("github", github)
      .maybeSingle<Member>();

    if (ex) {
      const last = ex.last_solved_at ? new Date(ex.last_solved_at) : null;
      const daysSinceLast = last
        ? Math.floor((now.getTime() - last.getTime()) / 86_400_000)
        : 999;
      const newStreak = countAsSolved
        ? daysSinceLast === 0
          ? ex.streak || 1
          : daysSinceLast === 1
            ? (ex.streak || 0) + 1
            : 1
        : ex.streak || 0; // arena: leave streak untouched

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.from("members") as any)
        .update({
          total_points: (ex.total_points || 0) + effectivePoints,
          problems_solved: (ex.problems_solved || 0) + (countAsSolved ? 1 : 0),
          streak: newStreak,
          last_solved_at: countAsSolved ? now.toISOString() : ex.last_solved_at,
        })
        .eq("github", github);
    } else {
      const nameFromSub =
        subs.find((s) => s.github === github)?.name ||
        arenaSubs.find((a) => a.github === github)?.name ||
        github;
      await db.from("members").insert([
        {
          github,
          name: nameFromSub,
          total_points: effectivePoints,
          problems_solved: countAsSolved ? 1 : 0,
          streak: countAsSolved ? 1 : 0,
          last_solved_at: countAsSolved ? now.toISOString() : null,
        },
      ] as any);
    }

    const { data } = await db
      .from("members")
      .select("*")
      .order("total_points", { ascending: false });
    setMembers(data || []);
  }

  // ── Problem CRUD ──────────────────────────────────────────
  async function saveProblem(
    form: Omit<Problem, "id" | "created_at" | "updated_at">,
  ) {
    if (editingProblem) {
      console.log("FORM DATA:", form);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from("problems") as any)
        .update(form)
        .eq("id", editingProblem.id);
      if (error) throw new Error((error as any).message);
      setProbs((prev) =>
        prev.map((p) => (p.id === editingProblem.id ? { ...p, ...form } : p)),
      );
      showToast("Problem updated ✓");
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (db.from("problems") as any)
        .insert([form])
        .select()
        .single();
      if (error) throw new Error((error as any).message);
      if (data) setProbs((prev) => [data as Problem, ...prev]);
      showToast("Problem created ✓");
    }
    setShowProblemForm(false);
    setEditingProblem(null);
  }

  const deleteProblem = async (id: string) => {
    const result = await openModal({
      type: "confirm-delete",
      id,
      github: "",
      confirmMsg: "Delete this problem? This cannot be undone.",
    });
    if (result === null) return;
    const { error } = await db.from("problems").delete().eq("id", id);
    if (error) {
      showToast("Delete failed: " + error.message);
      return;
    }
    setProbs((prev) => prev.filter((p) => p.id !== id));
    showToast("Problem deleted");
  };

  // ── Contest CRUD ──────────────────────────────────────────
  async function saveContest(form: Omit<Contest, "id" | "created_at">) {
    if (editingContest) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (db.from("contests") as any)
        .update(form)
        .eq("id", editingContest.id);
      if (error) throw new Error((error as any).message);
      setContests((prev) =>
        prev.map((c) => (c.id === editingContest.id ? { ...c, ...form } : c)),
      );
      showToast("Contest updated ✓");
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (db.from("contests") as any)
        .insert([form])
        .select()
        .single();
      if (error) throw new Error((error as any).message);
      if (data) setContests((prev) => [data as Contest, ...prev]);
      showToast("Contest created ✓");
    }
    setShowContestForm(false);
    setEditingContest(null);
  }

  async function setContestStatus(id: string, status: Contest["status"]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("contests") as any).update({ status }).eq("id", id);
    setContests((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c)),
    );
    showToast(`Contest set to ${status}`);
  }

  async function deleteContest(id: string) {
    const result = await openModal({
      type: "confirm-delete",
      id,
      github: "",
      confirmMsg: "Delete this contest? This cannot be undone.",
    });
    if (result === null) return;
    await db.from("contests").delete().eq("id", id);
    setContests((prev) => prev.filter((c) => c.id !== id));
    showToast("Contest deleted");
  }

  async function confirmReg(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("contest_registrations") as any)
      .update({ status: "confirmed" })
      .eq("id", id);
    setRegs((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: "confirmed" as const } : r,
      ),
    );
    showToast("Registration confirmed ✓");
  }

  async function rejectReg(id: string) {
    const reg = regs.find((r) => r.id === id);
    const reason = await openModal({
      type: "reject-reg",
      id,
      github: reg?.github || "",
    });
    if (reason === null) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("contest_registrations") as any)
      .update({ status: "rejected" })
      .eq("id", id);
    setRegs((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: "rejected" as const } : r,
      ),
    );
    showToast("Registration rejected");
  }

  function resetForms() {
    setShowProblemForm(false);
    setEditingProblem(null);
    setShowContestForm(false);
    setEditingContest(null);
  }

  const pendingArenaSubs = arenaSubs.filter((a) => a.status === "submitted");
  const navItems: { id: Section; label: string; badge?: number }[] = [
    { id: "overview", label: "📊 Overview" },
    {
      id: "submissions",
      label: "📥 Submissions",
      badge: subs.filter((s) => s.status === "pending").length,
    },
    { id: "arena", label: "⚔ Arena", badge: pendingArenaSubs.length },
    { id: "problems", label: "📚 Problems" },
    { id: "members", label: "👥 Members" },
    {
      id: "contests",
      label: "🏟 Contests",
      badge: regs.filter((r) => r.status === "pending").length,
    },
    { id: "weekly", label: "🏅 Weekly" },
  ];

  if (!user.is_admin)
    return <div className="text-[#ff4d4d] font-mono p-8">Access denied.</div>;

  return (
    <div className="flex gap-6">
      {modal.type && (
        <ActionModal
          modal={modal}
          onConfirm={closeModal}
          onCancel={cancelModal}
        />
      )}
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-[#00e87a] text-black px-4 py-2.5 rounded-lg font-mono text-sm shadow-xl">
          {toast}
        </div>
      )}

      <aside className="w-48 shrink-0">
        <div className="text-xs text-[#444] font-mono uppercase tracking-wider mb-3">
          Admin
        </div>
        <nav className="space-y-1">
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setSection(n.id);
                resetForms();
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-all flex items-center justify-between
                ${section === n.id ? "bg-[#00e87a15] text-[#00e87a]" : "text-[#666] hover:text-[#e0e0e0]"}`}
            >
              <span>{n.label}</span>
              {n.badge && n.badge > 0 ? (
                <span className="bg-[#ff4d4d] text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {n.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="flex items-center gap-2 text-[#666] font-mono pt-4">
            <div className="spinner" /> Loading...
          </div>
        ) : (
          <>
            {/* ── OVERVIEW ── */}
            {section === "overview" && (
              <div>
                <h2 className="font-display font-bold text-xl mb-5">
                  Overview
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  {[
                    { label: "Problems", val: probs.length },
                    { label: "Members", val: members.length },
                    { label: "Submissions", val: subs.length },
                    {
                      label: "Pending",
                      val:
                        subs.filter((s) => s.status === "pending").length +
                        pendingArenaSubs.length,
                      danger: true,
                    },
                  ].map((s) => (
                    <div key={s.label} className="card p-4 text-center">
                      <div
                        className={`text-3xl font-display font-extrabold ${"danger" in s && s.danger && s.val > 0 ? "text-[#ff4d4d]" : "text-[#00e87a]"}`}
                      >
                        {s.val}
                      </div>
                      <div className="text-xs text-[#444] font-mono mt-1">
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="card p-5">
                  <div className="text-xs text-[#444] font-mono uppercase tracking-wider mb-3">
                    Quick Actions
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => {
                        setSection("problems");
                        setShowProblemForm(true);
                      }}
                      className="btn-primary"
                    >
                      + New Problem
                    </button>
                    <button
                      onClick={() => {
                        setSection("contests");
                        setShowContestForm(true);
                      }}
                      className="px-5 py-2.5 bg-[#a78bfa20] text-[#a78bfa] font-mono font-bold text-sm rounded-lg hover:bg-[#a78bfa30] transition-all border border-[#a78bfa30]"
                    >
                      + New Contest
                    </button>
                    <button
                      onClick={() => setSection("submissions")}
                      className="btn-ghost"
                    >
                      Review Submissions →
                    </button>
                    {pendingArenaSubs.length > 0 && (
                      <button
                        onClick={() => setSection("arena")}
                        className="px-5 py-2.5 bg-[#ff4d4d20] text-[#ff4d4d] font-mono font-bold text-sm rounded-lg hover:bg-[#ff4d4d30] transition-all border border-[#ff4d4d30]"
                      >
                        Review Arena ({pendingArenaSubs.length}) →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── SUBMISSIONS ── */}
            {section === "submissions" && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-display font-bold text-xl">
                    Submissions
                  </h2>
                  <div className="flex gap-3 text-xs font-mono">
                    <span className="text-[#f0b429]">
                      {subs.filter((s) => s.status === "pending").length}{" "}
                      pending
                    </span>
                    <span className="text-[#444]">·</span>
                    <span className="text-[#00e87a]">
                      {subs.filter((s) => s.status === "approved").length}{" "}
                      approved
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {subs.length === 0 && (
                    <div className="text-center py-16 text-[#444] font-mono">
                      No submissions yet.
                    </div>
                  )}
                  {subs.map((s) => (
                    <div
                      key={s.id}
                      className={`card p-4 transition-all ${s.status === "pending" ? "border-[#f0b42930]" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono font-bold text-[#e0e0e0]">
                            {s.problem_title}
                          </div>
                          <div className="text-xs text-[#666] font-mono mt-0.5">
                            @{s.github} · {s.lang} ·{" "}
                            {new Date(s.created_at).toLocaleString()}
                          </div>
                          {s.approach && (
                            <div className="text-xs text-[#888] mt-1.5 font-mono bg-[#0a0a0a] rounded px-2 py-1 max-w-lg">
                              <span className="text-[#444]">Approach: </span>
                              {s.approach}
                            </div>
                          )}
                          {s.tests_total > 0 && (
                            <div className="text-xs text-[#666] mt-1 font-mono">
                              Tests: {s.tests_passed}/{s.tests_total} ·
                              potential {s.points_awarded} pts
                            </div>
                          )}
                          {s.reject_reason && (
                            <div className="text-xs text-[#ff4d4d] mt-1 font-mono">
                              Reason: {s.reject_reason}
                            </div>
                          )}
                          {s.code && <CodeViewer code={s.code} lang={s.lang} />}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-xs font-mono px-2 py-0.5 rounded font-bold ${s.status === "approved" ? "bg-[#00e87a15] text-[#00e87a]" : s.status === "rejected" ? "bg-[#ff4d4d15] text-[#ff4d4d]" : "bg-[#f0b42915] text-[#f0b429]"}`}
                          >
                            {s.status}
                          </span>
                          {s.status === "pending" && (
                            <>
                              <button
                                onClick={() =>
                                  approveSubmission(
                                    s.id,
                                    s.github,
                                    s.points_awarded || 100,
                                  )
                                }
                                className="px-3 py-1.5 bg-[#00e87a] text-black text-xs font-mono font-bold rounded-lg hover:bg-[#00ff88] transition-all"
                              >
                                ✓ Approve
                              </button>
                              <button
                                onClick={() => rejectSubmission(s.id, s.github)}
                                className="px-3 py-1.5 bg-[#ff4d4d20] text-[#ff4d4d] text-xs font-mono rounded-lg hover:bg-[#ff4d4d30] transition-all"
                              >
                                ✗ Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ARENA ── */}
            {section === "arena" &&
              (() => {
                const contestGroups = arenaSubs.reduce<
                  Record<
                    string,
                    {
                      contestName: string;
                      users: Record<string, ArenaSubmission[]>;
                    }
                  >
                >((acc, a) => {
                  const cid = a.contest_id || "__no_contest__";
                  if (!acc[cid])
                    acc[cid] = {
                      contestName: a.contest_name || "Unknown Contest",
                      users: {},
                    };
                  if (!acc[cid].users[a.github]) acc[cid].users[a.github] = [];
                  acc[cid].users[a.github].push(a);
                  return acc;
                }, {});

                return (
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="font-display font-bold text-xl">
                        Arena Submissions
                      </h2>
                      <div className="flex gap-3 text-xs font-mono">
                        <span className="text-[#f0b429]">
                          {pendingArenaSubs.length} pending
                        </span>
                        <span className="text-[#444]">·</span>
                        <span className="text-[#00e87a]">
                          {
                            arenaSubs.filter((a) => a.status === "reviewed")
                              .length
                          }{" "}
                          reviewed
                        </span>
                      </div>
                    </div>
                    <div className="mb-4 p-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg text-xs font-mono text-[#666]">
                      ℹ Points formula: base × (1 − strikes×0.1) × time_factor
                      (0.5–1.0). Faster solves earn a higher time_factor. You
                      can override before approving.
                    </div>
                    {arenaSubs.length === 0 && (
                      <div className="text-center py-16 text-[#444] font-mono">
                        No arena submissions yet.
                      </div>
                    )}
                    <div className="space-y-6">
                      {Object.entries(contestGroups).map(
                        ([cid, { contestName, users }]) => {
                          const contest = contests.find((c) => c.id === cid);
                          const userCount = Object.keys(users).length;
                          const subCount = Object.values(users).flat().length;
                          const pendingCount = Object.values(users)
                            .flat()
                            .filter((a) => a.status === "submitted").length;
                          return (
                            <div
                              key={cid}
                              className="card border-[#2a2a2a] overflow-hidden"
                            >
                              <div className="px-5 py-3 bg-[#0d0d0d] border-b border-[#1f1f1f] flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                  <span className="font-display font-bold text-[#e0e0e0]">
                                    {contestName}
                                  </span>
                                  {contest && (
                                    <span
                                      className={`ml-2 text-[10px] font-mono px-2 py-0.5 rounded font-bold ${contest.status === "live" ? "bg-[#00e87a15] text-[#00e87a]" : contest.status === "upcoming" ? "bg-[#f0b42915] text-[#f0b429]" : "bg-[#33333318] text-[#666]"}`}
                                    >
                                      {contest.status}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-3 text-[10px] font-mono text-[#444]">
                                  <span>
                                    {userCount} participant
                                    {userCount !== 1 ? "s" : ""}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {subCount} submission
                                    {subCount !== 1 ? "s" : ""}
                                  </span>
                                  {pendingCount > 0 && (
                                    <>
                                      <span>·</span>
                                      <span className="text-[#f0b429]">
                                        {pendingCount} pending
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="divide-y divide-[#161616]">
                                {Object.entries(users).map(
                                  ([github, userSubs]) => {
                                    const totalAwarded = userSubs
                                      .filter((a) => a.status === "reviewed")
                                      .reduce(
                                        (sum, a) =>
                                          sum + (a.points_awarded || 0),
                                        0,
                                      );
                                    const pendingUserSubs = userSubs.filter(
                                      (a) => a.status === "submitted",
                                    );
                                    return (
                                      <div key={github} className="px-5 py-4">
                                        <div className="flex items-center gap-3 mb-3">
                                          <img
                                            src={`https://github.com/${github}.png?size=28`}
                                            alt={github}
                                            className="w-7 h-7 rounded-full ring-1 ring-[#2a2a2a] shrink-0"
                                            onError={(e) => {
                                              (
                                                e.target as HTMLImageElement
                                              ).style.display = "none";
                                            }}
                                          />
                                          <span className="font-mono font-bold text-[#e0e0e0] text-sm">
                                            @{github}
                                          </span>
                                          <span className="text-[10px] text-[#444] font-mono">
                                            {userSubs.length} problem
                                            {userSubs.length !== 1 ? "s" : ""}
                                          </span>
                                          {totalAwarded > 0 && (
                                            <span className="ml-auto text-xs font-mono text-[#00e87a] font-bold">
                                              {totalAwarded} pts awarded
                                            </span>
                                          )}
                                          {pendingUserSubs.length > 0 &&
                                            totalAwarded === 0 && (
                                              <span className="ml-auto text-[10px] font-mono text-[#f0b429]">
                                                {pendingUserSubs.length} pending
                                              </span>
                                            )}
                                        </div>
                                        <div className="space-y-2 pl-10">
                                          {userSubs.map((a) => {
                                            const probId =
                                              a.problem_id ||
                                              contest?.problem_id ||
                                              null;
                                            const prob = probId
                                              ? probs.find(
                                                  (p) => p.id === probId,
                                                )
                                              : null;
                                            const basePts = prob?.points || 200;
                                            return (
                                              <div
                                                key={a.id}
                                                className={`bg-[#0d0d0d] border rounded-xl p-3 transition-all ${a.status === "submitted" ? "border-[#f0b42930]" : a.status === "disqualified" ? "border-[#ff4d4d20]" : "border-[#1a1a1a]"}`}
                                              >
                                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                                  <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                      <span className="text-sm font-mono text-[#a78bfa] font-medium">
                                                        {prob?.title ||
                                                          a.problem_title ||
                                                          "Unknown Problem"}
                                                      </span>
                                                      <span className="text-[10px] text-[#444] font-mono">
                                                        {basePts} pts base
                                                      </span>
                                                      {a.strikes > 0 && (
                                                        <span className="text-[10px] font-mono bg-[#ff4d4d15] text-[#ff4d4d] px-1.5 py-0.5 rounded">
                                                          ⚠ {a.strikes} strikes
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="text-[10px] text-[#555] font-mono mt-0.5">
                                                      {a.lang} ·{" "}
                                                      {new Date(
                                                        a.created_at,
                                                      ).toLocaleString()}
                                                      {a.strike_penalty_factor &&
                                                        a.strike_penalty_factor !==
                                                          1 && (
                                                          <span className="ml-2 text-[#a78bfa]">
                                                            time×
                                                            {a.strike_penalty_factor.toFixed(
                                                              2,
                                                            )}
                                                          </span>
                                                        )}
                                                    </div>
                                                    {a.points_awarded > 0 &&
                                                      a.status ===
                                                        "reviewed" && (
                                                        <div className="text-xs text-[#00e87a] font-mono mt-0.5 font-bold">
                                                          ✓ Awarded:{" "}
                                                          {a.points_awarded} pts
                                                        </div>
                                                      )}
                                                    {a.code && (
                                                      <CodeViewer
                                                        code={a.code}
                                                        lang={a.lang}
                                                      />
                                                    )}
                                                  </div>
                                                  <div className="flex items-center gap-2 shrink-0">
                                                    <span
                                                      className={`text-xs font-mono px-2 py-0.5 rounded font-bold ${a.status === "reviewed" ? "bg-[#00e87a15] text-[#00e87a]" : a.status === "disqualified" ? "bg-[#ff4d4d15] text-[#ff4d4d]" : "bg-[#f0b42915] text-[#f0b429]"}`}
                                                    >
                                                      {a.status}
                                                    </span>
                                                    {a.status ===
                                                      "submitted" && (
                                                      <>
                                                        <button
                                                          onClick={() =>
                                                            approveArenaSubmission(
                                                              a,
                                                              basePts,
                                                            )
                                                          }
                                                          className="px-3 py-1.5 bg-[#00e87a] text-black text-xs font-mono font-bold rounded-lg hover:bg-[#00ff88] transition-all"
                                                        >
                                                          ✓ Approve
                                                        </button>
                                                        <button
                                                          onClick={() =>
                                                            rejectArenaSubmission(
                                                              a.id,
                                                              a.github,
                                                            )
                                                          }
                                                          className="px-3 py-1.5 bg-[#ff4d4d20] text-[#ff4d4d] text-xs font-mono rounded-lg hover:bg-[#ff4d4d30] transition-all"
                                                        >
                                                          ✗ Reject
                                                        </button>
                                                      </>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* ── PROBLEMS ── */}
            {section === "problems" && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-display font-bold text-xl">
                    Problems ({probs.length})
                  </h2>
                  {!showProblemForm && !editingProblem && (
                    <button
                      onClick={() => {
                        setShowProblemForm(true);
                        setEditingProblem(null);
                      }}
                      className="btn-primary"
                    >
                      + New Problem
                    </button>
                  )}
                </div>
                {(showProblemForm || editingProblem) && (
                  <div className="card border-[#00e87a20] p-6 mb-6">
                    <h3 className="font-mono font-bold text-[#00e87a] mb-5">
                      {editingProblem
                        ? `✏ Edit: ${editingProblem.title}`
                        : "+ Create New Problem"}
                    </h3>
                    <ProblemForm
                      initial={editingProblem || {}}
                      onSave={saveProblem}
                      onCancel={() => {
                        setShowProblemForm(false);
                        setEditingProblem(null);
                      }}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  {probs.length === 0 && !showProblemForm && (
                    <div className="text-center py-16 text-[#444] font-mono">
                      No problems yet. Click "+ New Problem" to get started.
                    </div>
                  )}
                  {probs.map((p) => (
                    <div
                      key={p.id}
                      className="card px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-[#e0e0e0] truncate">
                          {p.title}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span
                            className={
                              p.difficulty === "Easy"
                                ? "diff-easy"
                                : p.difficulty === "Medium"
                                  ? "diff-medium"
                                  : "diff-hard"
                            }
                          >
                            {p.difficulty}
                          </span>
                          <span className="text-[10px] text-[#a78bfa] font-mono">
                            {p.points} pts
                          </span>
                          <span className="text-[10px] text-[#444] font-mono">
                            {(p.test_cases || []).length} tests
                          </span>
                          {(p.tags || []).map((t) => (
                            <span
                              key={t}
                              className="text-[10px] text-[#444] bg-[#0f0f0f] px-1.5 py-0.5 rounded font-mono"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setEditingProblem(p);
                            setShowProblemForm(false);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="px-3 py-1.5 bg-[#1a1a1a] text-[#888] hover:text-[#00e87a] text-xs font-mono rounded-lg transition-all border border-[#2a2a2a]"
                        >
                          ✏ Edit
                        </button>
                        <button
                          onClick={() => deleteProblem(p.id)}
                          className="px-3 py-1.5 bg-[#ff4d4d10] text-[#ff4d4d] hover:bg-[#ff4d4d20] text-xs font-mono rounded-lg transition-all"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── MEMBERS ── */}
            {section === "members" && (
              <div>
                <h2 className="font-display font-bold text-xl mb-5">
                  Members ({members.length})
                </h2>
                <div className="space-y-2">
                  {members.length === 0 && (
                    <div className="text-center py-16 text-[#444] font-mono">
                      No members yet.
                    </div>
                  )}
                  {members.map((m, i) => (
                    <div
                      key={m.id}
                      className={`card px-5 py-4 flex items-center gap-4 ${i === 0 ? "border-[#00e87a40]" : i === 1 ? "border-[#a78bfa30]" : i === 2 ? "border-[#f0b42930]" : ""}`}
                    >
                      <div className="w-8 text-center font-mono font-bold text-sm shrink-0 text-[#444]">
                        {i === 0 ? "👑" : `#${i + 1}`}
                      </div>
                      <div className="w-8 h-8 bg-[#1a1a1a] rounded-full flex items-center justify-center font-display font-bold text-[#00e87a] text-sm shrink-0">
                        {(m.name || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[#e0e0e0] truncate">
                          {m.name}
                        </div>
                        <div className="text-xs text-[#444] font-mono">
                          @{m.github}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-[#00e87a]">
                          {m.total_points} XP
                        </div>
                        <div className="text-xs text-[#444] font-mono">
                          {m.problems_solved} solved · {m.streak}🔥
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── CONTESTS ── */}
            {section === "contests" && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-display font-bold text-xl">Contests</h2>
                  {!showContestForm && !editingContest && (
                    <button
                      onClick={() => {
                        setShowContestForm(true);
                        setEditingContest(null);
                      }}
                      className="px-5 py-2.5 bg-[#a78bfa] text-white font-mono font-bold text-sm rounded-lg hover:bg-[#9061f9] transition-all"
                    >
                      + New Contest
                    </button>
                  )}
                </div>
                {(showContestForm || editingContest) && (
                  <div className="card border-[#a78bfa20] p-6 mb-6">
                    <h3 className="font-mono font-bold text-[#a78bfa] mb-5">
                      {editingContest
                        ? `✏ Edit: ${editingContest.name}`
                        : "+ Create New Contest"}
                    </h3>
                    <ContestForm
                      initial={editingContest || {}}
                      problems={probs}
                      onSave={saveContest}
                      onCancel={() => {
                        setShowContestForm(false);
                        setEditingContest(null);
                      }}
                      onProblemCreated={(p) => {
                        setProbs((prev) => [p, ...prev]);
                        showToast(`Problem "${p.title}" created & assigned ✓`);
                      }}
                    />
                  </div>
                )}
                {regs.filter((r) => r.status === "pending").length > 0 && (
                  <div className="mb-5">
                    <div className="text-sm text-[#f0b429] font-mono mb-2">
                      ⚠ {regs.filter((r) => r.status === "pending").length}{" "}
                      pending registration(s) need review
                    </div>
                    <div className="space-y-2">
                      {regs
                        .filter((r) => r.status === "pending")
                        .map((r) => (
                          <div
                            key={r.id}
                            className="card border-[#f0b42930] px-4 py-3 flex items-center justify-between gap-3"
                          >
                            <div>
                              <div className="font-mono text-[#e0e0e0] text-sm">
                                {r.name}{" "}
                                <span className="text-[#444]">@{r.github}</span>
                              </div>
                              <div className="text-xs text-[#666] font-mono mt-0.5">
                                {r.contest_name} · Txn: {r.txn_id || "N/A"}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => confirmReg(r.id)}
                                className="px-3 py-1.5 bg-[#00e87a] text-black text-xs font-mono font-bold rounded-lg hover:bg-[#00ff88] transition-all"
                              >
                                ✓ Confirm
                              </button>
                              <button
                                onClick={() => rejectReg(r.id)}
                                className="px-3 py-1.5 bg-[#ff4d4d20] text-[#ff4d4d] text-xs font-mono rounded-lg hover:bg-[#ff4d4d30] transition-all"
                              >
                                ✗ Reject
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  {contests.length === 0 && !showContestForm && (
                    <div className="text-center py-16 text-[#444] font-mono">
                      No contests yet.
                    </div>
                  )}
                  {contests.map((c) => (
                    <div
                      key={c.id}
                      className={`card p-4 ${c.status === "live" ? "border-[#00e87a40]" : ""}`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                        <div>
                          <div className="font-mono font-bold text-[#e0e0e0]">
                            {c.name}
                          </div>
                          <div className="text-xs text-[#666] font-mono mt-0.5">
                            ₹{c.entry_fee} entry · {c.duration_mins}m ·{" "}
                            {c.prize_note || "No prize note"}
                          </div>
                          {c.problem_id && (
                            <div className="text-xs text-[#a78bfa] font-mono mt-0.5">
                              Problem:{" "}
                              {probs.find((p) => p.id === c.problem_id)
                                ?.title || c.problem_id}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {(["upcoming", "live", "ended"] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => setContestStatus(c.id, s)}
                              className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all capitalize
                                ${c.status === s ? (s === "live" ? "bg-[#00e87a] text-black font-bold" : s === "upcoming" ? "bg-[#f0b429] text-black font-bold" : "bg-[#333] text-[#e0e0e0] font-bold") : "text-[#444] hover:text-[#666] border border-[#2a2a2a]"}`}
                            >
                              {s}
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              setEditingContest(c);
                              setShowContestForm(false);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="px-3 py-1 bg-[#1a1a1a] text-[#888] hover:text-[#a78bfa] text-xs font-mono rounded-lg transition-all border border-[#2a2a2a]"
                          >
                            ✏ Edit
                          </button>
                          <button
                            onClick={() => deleteContest(c.id)}
                            className="px-3 py-1 bg-[#ff4d4d10] text-[#ff4d4d] hover:bg-[#ff4d4d20] text-xs font-mono rounded-lg transition-all"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {regs.filter((r) => r.contest_id === c.id).length > 0 && (
                        <div className="pt-3 border-t border-[#1a1a1a]">
                          <div className="text-[10px] text-[#444] font-mono mb-1.5 uppercase">
                            Registrations (
                            {regs.filter((r) => r.contest_id === c.id).length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {regs
                              .filter((r) => r.contest_id === c.id)
                              .map((r) => (
                                <span
                                  key={r.id}
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded ${r.status === "confirmed" ? "bg-[#00e87a15] text-[#00e87a]" : r.status === "pending" ? "bg-[#f0b42915] text-[#f0b429]" : "bg-[#ff4d4d15] text-[#ff4d4d]"}`}
                                >
                                  @{r.github}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════ WEEKLY CHALLENGE SECTION ════════ */}
        {section === "weekly" && <WeeklyAdminSection user={user} />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Weekly Challenge Admin Section
// ════════════════════════════════════════════════════════════

// Convert a Date to the value format datetime-local expects: "YYYY-MM-DDTHH:mm" in LOCAL time
function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function blankWeekly(): Omit<WeeklyChallenge, 'id' | 'created_at'> {
  const now   = new Date();
  const end   = new Date(now);
  end.setDate(end.getDate() + 7);
  return {
    title:       '',
    description: '',
    problem_ids: [],
    entry_fee:   49,
    upi_id:      '',
    starts_at:   toLocalDatetimeInput(now),
    ends_at:     toLocalDatetimeInput(end),
    status:      'upcoming',
  };
}

function WeeklyAdminSection({ user }: { user: User }) {
  const db = getSupabaseClient();

  const [challenges,   setChallenges]   = useState<WeeklyChallenge[]>([]);
  const [accesses,     setAccesses]     = useState<WeeklyAccess[]>([]);
  const [problems,     setProblems]     = useState<Problem[]>([]);
  const [submissions,  setSubmissions]  = useState<any[]>([]);
  const [form,         setForm]         = useState<Omit<WeeklyChallenge, 'id' | 'created_at'> | null>(null);
  const [editId,       setEditId]       = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState('');
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [manageTab,    setManageTab]    = useState<Record<string, 'payments' | 'submissions'>>({});
  const [editingPts,   setEditingPts]   = useState<Record<string, string>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: ch }, { data: acc }, { data: probs }, { data: subs }] = await Promise.all([
      (db.from('weekly_challenges') as any).select('*').order('created_at', { ascending: false }),
      (db.from('weekly_access') as any).select('*').order('created_at', { ascending: false }),
      db.from('problems').select('id, title, difficulty, points').order('title'),
      (db.from('weekly_submissions') as any).select('*').order('submitted_at', { ascending: false }),
    ]);
    setChallenges((ch || []) as WeeklyChallenge[]);
    setAccesses((acc || []) as WeeklyAccess[]);
    setProblems((probs || []) as Problem[]);
    setSubmissions(subs || []);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  function startCreate() {
    setEditId(null);
    setForm(blankWeekly());
  }

  function startEdit(ch: WeeklyChallenge) {
    setEditId(ch.id);
    setForm({
      title:       ch.title,
      description: ch.description,
      problem_ids: ch.problem_ids || [],
      entry_fee:   ch.entry_fee,
      upi_id:      ch.upi_id,
      starts_at:   toLocalDatetimeInput(new Date(ch.starts_at)),
      ends_at:     toLocalDatetimeInput(new Date(ch.ends_at)),
      status:      ch.status,
    });
  }

  async function saveForm() {
    if (!form) return;
    if (!form.title.trim()) { showToast('Title required'); return; }
    if (form.problem_ids.length === 0) { showToast('Select at least 1 problem'); return; }
    if (!form.upi_id.trim()) { showToast('UPI ID required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at:   new Date(form.ends_at).toISOString(),
      };
      if (editId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (db.from('weekly_challenges') as any)
          .update(payload).eq('id', editId);
        if (error) throw error;
        showToast('Updated ✓');
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (db.from('weekly_challenges') as any).insert(payload);
        if (error) throw error;
        showToast('Created ✓');
      }
      setForm(null); setEditId(null);
      load();
    } catch (e: any) {
      showToast('Error: ' + (e.message || 'Unknown'));
    } finally { setSaving(false); }
  }

  async function deleteChallenge(id: string) {
    if (!confirm('Delete this weekly challenge?')) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('weekly_challenges') as any).delete().eq('id', id);
    load();
  }

  async function updateAccessStatus(id: string, status: 'confirmed' | 'rejected') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('weekly_access') as any).update({ status }).eq('id', id);
    load();
  }

  async function updatePoints(subId: string, newPts: string) {
    const pts = parseInt(newPts, 10);
    if (isNaN(pts) || pts < 0) { showToast('Enter a valid number'); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from('weekly_submissions') as any)
      .update({ points_awarded: pts }).eq('id', subId);
    if (error) { showToast('Update failed'); return; }
    setEditingPts(prev => { const n = { ...prev }; delete n[subId]; return n; });
    showToast('Points updated ✓');
    load();
  }

  function toggleProblem(id: string) {
    if (!form) return;
    const ids = form.problem_ids;
    if (ids.includes(id)) {
      setForm({ ...form, problem_ids: ids.filter(x => x !== id) });
    } else {
      setForm({ ...form, problem_ids: [...ids, id] });
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {toast && (
        <div className="fixed top-20 right-4 z-[200] px-4 py-2 bg-[#00e87a] text-black font-mono text-sm rounded-xl shadow-xl">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono font-bold text-[#e0e0e0] text-base">Weekly Challenge</h2>
          <p className="text-[10px] text-[#444] font-mono mt-0.5">Create paid weekly problem sets with time-bonus scoring.</p>
        </div>
        {!form && (
          <button onClick={startCreate}
            className="px-4 py-2 bg-[#00e87a20] text-[#00e87a] font-mono text-sm rounded-xl hover:bg-[#00e87a30] transition-all">
            + New Challenge
          </button>
        )}
      </div>

      {/* Form */}
      {form && (
        <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-2xl p-5 space-y-4">
          <h3 className="font-mono font-bold text-[#e0e0e0] text-sm">{editId ? 'Edit' : 'New'} Weekly Challenge</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#444] font-mono uppercase">Title *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Week 1 — Arrays"
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40]" />
            </div>
            <div>
              <label className="text-[10px] text-[#444] font-mono uppercase">Entry Fee (₹) *</label>
              <input type="number" value={form.entry_fee} onChange={e => setForm({ ...form, entry_fee: +e.target.value })}
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-[#444] font-mono uppercase">Description</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description shown to users"
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40]" />
            </div>
            <div>
              <label className="text-[10px] text-[#444] font-mono uppercase">UPI ID *</label>
              <input value={form.upi_id} onChange={e => setForm({ ...form, upi_id: e.target.value })}
                placeholder="yourname@upi"
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40]" />
            </div>
            <div>
              <label className="text-[10px] text-[#444] font-mono uppercase">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none">
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[#444] font-mono uppercase">Starts At</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })}
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-[#444] font-mono uppercase">Ends At</label>
              <input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })}
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none" />
            </div>
          </div>

          {/* Problem picker */}
          <div>
            <label className="text-[10px] text-[#444] font-mono uppercase">
              Problems — {form.problem_ids.length} selected
            </label>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
              {problems.map(p => {
                const selected = form.problem_ids.includes(p.id);
                return (
                  <button key={p.id} onClick={() => toggleProblem(p.id)}
                    className={`text-left px-3 py-2 rounded-xl border text-xs font-mono transition-all
                      ${selected
                        ? 'border-[#00e87a40] bg-[#00e87a10] text-[#00e87a]'
                        : 'border-[#1f1f1f] text-[#888] hover:border-[#2a2a2a] hover:text-[#e0e0e0]'}`}>
                    {selected ? '✓ ' : '  '}{p.title}
                    <span className={`ml-2 text-[10px] ${p.difficulty === 'Easy' ? 'text-[#00e87a]' : p.difficulty === 'Medium' ? 'text-[#f0b429]' : 'text-[#ff4d4d]'}`}>
                      {p.difficulty}
                    </span>
                    <span className="ml-1 text-[#a78bfa]">{p.points}pt</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => { setForm(null); setEditId(null); }}
              className="flex-1 py-2 bg-[#1a1a1a] text-[#666] font-mono text-sm rounded-xl hover:text-[#e0e0e0]">
              Cancel
            </button>
            <button onClick={saveForm} disabled={saving}
              className="flex-1 py-2 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl hover:bg-[#00ff88] disabled:opacity-50">
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Challenge'}
            </button>
          </div>
        </div>
      )}

      {/* Challenges list */}
      {challenges.length === 0 && !form && (
        <div className="text-center py-12 text-[#444] font-mono text-sm">No weekly challenges yet.</div>
      )}

      <div className="space-y-4">
        {challenges.map(ch => {
          const chAccesses = accesses.filter(a => a.weekly_challenge_id === ch.id);
          const pending    = chAccesses.filter(a => a.status === 'pending');
          const confirmed  = chAccesses.filter(a => a.status === 'confirmed');
          const isOpen     = expandedId === ch.id;

          return (
            <div key={ch.id} className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-[#e0e0e0] text-sm">{ch.title}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg ${ch.status === 'active' ? 'bg-[#00e87a15] text-[#00e87a]' : ch.status === 'upcoming' ? 'bg-[#f0b42915] text-[#f0b429]' : 'bg-[#ff4d4d15] text-[#ff4d4d]'}`}>
                      {ch.status.toUpperCase()}
                    </span>
                    {pending.length > 0 && (
                      <span className="text-[10px] font-mono bg-[#ff4d4d20] text-[#ff4d4d] px-2 py-0.5 rounded-lg">
                        {pending.length} pending payment{pending.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#444] font-mono mt-1">
                    ₹{ch.entry_fee} · {new Date(ch.starts_at).toLocaleDateString()} – {new Date(ch.ends_at).toLocaleDateString()} · {confirmed.length} confirmed
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setExpandedId(isOpen ? null : ch.id)}
                    className="text-xs font-mono text-[#555] hover:text-[#e0e0e0] px-3 py-1.5 bg-[#1a1a1a] rounded-lg">
                    {isOpen ? 'Collapse' : 'Manage'}
                  </button>
                  <button onClick={() => startEdit(ch)}
                    className="text-xs font-mono text-[#a78bfa] hover:text-[#c4b5fd] px-3 py-1.5 bg-[#a78bfa15] rounded-lg">
                    Edit
                  </button>
                  <button onClick={() => deleteChallenge(ch.id)}
                    className="text-xs font-mono text-[#ff4d4d] px-3 py-1.5 bg-[#ff4d4d15] rounded-lg hover:bg-[#ff4d4d25]">
                    Del
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-[#1a1a1a] px-5 py-4">

                  {/* Sub-tabs */}
                  <div className="flex gap-1 mb-4">
                    {(['payments', 'submissions'] as const).map(t => (
                      <button key={t} onClick={() => setManageTab(prev => ({ ...prev, [ch.id]: t }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all capitalize
                          ${(manageTab[ch.id] || 'payments') === t
                            ? 'bg-[#00e87a] text-black font-bold'
                            : 'bg-[#1a1a1a] text-[#555] hover:text-[#e0e0e0]'}`}>
                        {t === 'payments'
                          ? `Payments (${chAccesses.length})`
                          : `Submissions (${submissions.filter(s => s.weekly_challenge_id === ch.id).length})`}
                      </button>
                    ))}
                  </div>

                  {/* Payments tab */}
                  {(manageTab[ch.id] || 'payments') === 'payments' && (
                    <>
                      {chAccesses.length === 0 ? (
                        <p className="text-xs text-[#333] font-mono">No payment submissions yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {chAccesses.map(a => (
                            <div key={a.id} className="flex items-center gap-3 flex-wrap px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl">
                              <img src={`https://github.com/${a.github}.png?size=24`} className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              <span className="text-xs font-mono text-[#e0e0e0] flex-1 min-w-0 truncate">{a.name} <span className="text-[#444]">@{a.github}</span></span>
                              <span className="text-[10px] font-mono text-[#555]">Txn: {a.txn_id || '—'}</span>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg ${a.status === 'confirmed' ? 'bg-[#00e87a15] text-[#00e87a]' : a.status === 'pending' ? 'bg-[#f0b42915] text-[#f0b429]' : 'bg-[#ff4d4d15] text-[#ff4d4d]'}`}>
                                {a.status}
                              </span>
                              {a.status === 'pending' && (
                                <div className="flex gap-1.5">
                                  <button onClick={() => updateAccessStatus(a.id, 'confirmed')}
                                    className="text-[10px] font-mono text-[#00e87a] bg-[#00e87a15] px-2 py-1 rounded-lg hover:bg-[#00e87a25]">
                                    Confirm
                                  </button>
                                  <button onClick={() => updateAccessStatus(a.id, 'rejected')}
                                    className="text-[10px] font-mono text-[#ff4d4d] bg-[#ff4d4d15] px-2 py-1 rounded-lg hover:bg-[#ff4d4d25]">
                                    Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Submissions tab */}
                  {manageTab[ch.id] === 'submissions' && (() => {
                    const chSubs = submissions.filter(s => s.weekly_challenge_id === ch.id);
                    return chSubs.length === 0 ? (
                      <p className="text-xs text-[#333] font-mono">No submissions yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {/* Header */}
                        <div className="hidden sm:grid grid-cols-[1fr_6rem_4rem_4rem_5rem_6rem] gap-3 px-3 py-1
                          text-[10px] text-[#333] font-mono uppercase tracking-widest border-b border-[#1a1a1a]">
                          <div>User / Problem</div>
                          <div>Lang</div>
                          <div>Tests</div>
                          <div>When</div>
                          <div className="text-center">Points</div>
                          <div className="text-center">Override</div>
                        </div>
                        {chSubs.map((s: any) => {
                          const isEditing = editingPts[s.id] !== undefined;
                          const daysSince = Math.floor((Date.now() - new Date(s.submitted_at).getTime()) / 86400000);
                          return (
                            <div key={s.id} className="grid grid-cols-1 sm:grid-cols-[1fr_6rem_4rem_4rem_5rem_6rem] gap-3 items-center px-3 py-2.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <img src={`https://github.com/${s.github}.png?size=16`} className="w-4 h-4 rounded-full shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  <span className="text-xs font-mono text-[#e0e0e0] truncate">{s.name}</span>
                                  <span className="text-[10px] font-mono text-[#444] truncate">@{s.github}</span>
                                </div>
                                <div className="text-[10px] font-mono text-[#555] mt-0.5 truncate">{s.problem_title}</div>
                              </div>
                              <div className="text-[10px] font-mono text-[#555]">{s.lang}</div>
                              <div className="text-[10px] font-mono text-[#888]">{s.tests_passed}/{s.tests_total}</div>
                              <div className="text-[10px] font-mono text-[#444]">Day {daysSince + 1}</div>
                              <div className="text-center">
                                {isEditing ? (
                                  <input
                                    type="number" min="0"
                                    value={editingPts[s.id]}
                                    onChange={e => setEditingPts(prev => ({ ...prev, [s.id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') updatePoints(s.id, editingPts[s.id]); if (e.key === 'Escape') setEditingPts(prev => { const n = { ...prev }; delete n[s.id]; return n; }); }}
                                    className="w-16 bg-[#111] border border-[#00e87a40] rounded-lg px-2 py-1 text-xs font-mono text-[#00e87a] text-center focus:outline-none"
                                    autoFocus
                                  />
                                ) : (
                                  <span className="text-sm font-mono font-bold text-[#a78bfa]">{s.points_awarded}</span>
                                )}
                              </div>
                              <div className="flex justify-center gap-1">
                                {isEditing ? (
                                  <>
                                    <button onClick={() => updatePoints(s.id, editingPts[s.id])}
                                      className="text-[10px] font-mono text-[#00e87a] bg-[#00e87a15] px-2 py-1 rounded-lg hover:bg-[#00e87a25]">
                                      Save
                                    </button>
                                    <button onClick={() => setEditingPts(prev => { const n = { ...prev }; delete n[s.id]; return n; })}
                                      className="text-[10px] font-mono text-[#555] bg-[#1a1a1a] px-2 py-1 rounded-lg hover:text-[#e0e0e0]">
                                      ✕
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => setEditingPts(prev => ({ ...prev, [s.id]: String(s.points_awarded) }))}
                                    className="text-[10px] font-mono text-[#a78bfa] bg-[#a78bfa15] px-2 py-1 rounded-lg hover:bg-[#a78bfa25]">
                                    Edit pts
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}