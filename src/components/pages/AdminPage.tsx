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
  Subscriber,
  ContestFeedback,
} from "@/types/database";

type Section =
  | "overview"
  | "submissions"
  | "arena"
  | "problems"
  | "members"
  | "contests"
  | "feedback"
  | "weekly"
  | "subscribers"
  | "ai-generate"
  | "announcements";

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
  hints: [],
  submission_count: 0,
});

const blankContest = (): Omit<Contest, "id" | "created_at"> => ({
  name: "",
  entry_fee: 0, // unused — contest entry is free for confirmed subscribers
  duration_mins: 60,
  upi_id: "", // unused — kept for legacy schema compatibility only
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
            className="flex items-center gap-1 bg-[#1a1a1a] text-[#ccc] text-xs font-mono px-2 py-0.5 rounded"
          >
            {t}
            <button
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="text-[#999] hover:text-[#ff4d4d] ml-0.5"
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
              <label className="text-[10px] text-[#999] font-mono uppercase">
                Input{" "}
                <span className="normal-case text-[#ccc]">
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
              <label className="text-[10px] text-[#999] font-mono uppercase">
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
            className="mt-4 text-[#999] hover:text-[#ff4d4d] text-lg leading-none font-mono"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...cases, { input: "", expected: "" }])}
        className="w-full py-1.5 border border-dashed border-[#2a2a2a] text-[#999] hover:text-[#00e87a] hover:border-[#00e87a40] text-xs font-mono rounded-lg transition-all"
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
  const [saving,           setSaving]           = useState(false);
  const [err,              setErr]              = useState("");
  const [generatingTests,  setGeneratingTests]  = useState(false);
  const [improvingDesc,    setImprovingDesc]    = useState(false);
  const [aiTestErr,        setAiTestErr]        = useState("");

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

  async function handleGenerateTests() {
    if (!form.title.trim()) { setAiTestErr("Add a title first."); return; }
    if (!form.description.trim()) { setAiTestErr("Add a description first."); return; }
    setGeneratingTests(true);
    setAiTestErr("");
    try {
      const { generateTestCases } = await import("@/lib/gemini");
      const generated = await generateTestCases(
        form.title,
        form.description,
        form.param_types,
        form.return_type,
        form.test_cases,
      );
      if (!generated.length) {
        setAiTestErr("AI couldn't generate test cases. Check your description and try again.");
      } else {
        set("test_cases", [...form.test_cases, ...generated]);
      }
    } catch {
      setAiTestErr("Generation failed. Try again.");
    }
    setGeneratingTests(false);
  }

  async function handleImproveDescription() {
    if (!form.description.trim()) { setErr("Add a rough description first."); return; }
    setImprovingDesc(true);
    try {
      const { improveDescription } = await import("@/lib/gemini");
      const improved = await improveDescription(
        form.title,
        form.description,
        form.param_types,
        form.return_type,
        form.example,
      );
      if (improved && !improved.startsWith('⚠️') && !improved.startsWith('AI error')) {
        set("description", improved);
      }
    } catch {}
    setImprovingDesc(false);
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
          <label className="block text-xs text-[#bbb] font-mono mb-1 uppercase tracking-wider">
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
          <label className="block text-xs text-[#bbb] font-mono mb-1 uppercase tracking-wider">
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
        <label className="block text-xs text-[#bbb] font-mono mb-2 uppercase tracking-wider">
          Difficulty
        </label>
        <div className="flex gap-2">
          {(["Easy", "Medium", "Hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => set("difficulty", d)}
              className={`px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition-all
                ${form.difficulty === d ? (d === "Easy" ? "bg-[#00e87a] text-black" : d === "Medium" ? "bg-[#f0b429] text-black" : "bg-[#ff4d4d] text-white") : "bg-[#1a1a1a] text-[#bbb] hover:text-[#e0e0e0]"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs text-[#bbb] font-mono mb-2 uppercase tracking-wider">
          Tags
        </label>
        <TagInput tags={form.tags} onChange={(t) => set("tags", t)} />
      </div>
      <div>
        <label className="block text-xs text-[#bbb] font-mono mb-2 uppercase tracking-wider">
          Visibility
        </label>
        <div className="flex gap-2">
          {(
            [
              {
                value: "public",
                label: "🌐 Public",
                desc: "Everyone on Problems page",
              },
              {
                value: "arena",
                label: "🏟 Arena",
                desc: "Only inside active Arena",
              },
              {
                value: "weekly",
                label: "🏅 Weekly",
                desc: "Locked — pay to unlock",
              },
            ] as {
              value: "public" | "arena" | "weekly";
              label: string;
              desc: string;
            }[]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set("visibility" as any, opt.value)}
              title={opt.desc}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-mono font-bold transition-all text-center
                ${
                  (form as any).visibility === opt.value ||
                  (!(form as any).visibility && opt.value === "public")
                    ? opt.value === "public"
                      ? "bg-[#00e87a] text-black"
                      : opt.value === "arena"
                        ? "bg-[#a78bfa] text-black"
                        : "bg-[#f0b429] text-black"
                    : "bg-[#1a1a1a] text-[#bbb] hover:text-[#e0e0e0]"
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[#999] font-mono mt-1.5">
          {(form as any).visibility === "arena" &&
            "Hidden from Problems page. Only appears inside an active Arena contest."}
          {(form as any).visibility === "weekly" &&
            "Shown on Problems page with a 🔒 lock. Unlocked after paying in the Weekly tab."}
          {(!(form as any).visibility ||
            (form as any).visibility === "public") &&
            "Visible and solvable by everyone on the Problems page."}
        </p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-[#bbb] font-mono uppercase tracking-wider">
            Description * (HTML)
          </label>
          <button
            onClick={handleImproveDescription}
            disabled={improvingDesc || !form.description.trim()}
            className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-lg
              bg-[#a78bfa10] border border-[#a78bfa25] text-[#a78bfa]
              hover:bg-[#a78bfa18] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {improvingDesc
              ? <><span className="w-2.5 h-2.5 border border-[#a78bfa] border-t-transparent rounded-full animate-spin inline-block mr-1" />Improving…</>
              : "✦ AI Improve"}
          </button>
        </div>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={compact ? 3 : 5}
          className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e0e0e0] placeholder-[#333] resize-y focus:outline-none focus:border-[#00e87a40]"
          placeholder="<p>Given an array of integers...</p>"
        />
      </div>
      <div>
        <label className="block text-xs text-[#bbb] font-mono mb-1 uppercase tracking-wider">
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
        <label className="block text-xs text-[#bbb] font-mono mb-1 uppercase tracking-wider">
          Starter Code (Python)
        </label>
        <div>
          <label className="block text-xs text-[#bbb] font-mono mb-1 uppercase tracking-wider">
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
          <label className="block text-xs text-[#bbb] font-mono mb-1 uppercase tracking-wider">
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
        <label className="block text-xs text-[#bbb] font-mono mb-2 uppercase tracking-wider">
          Hints <span className="text-[#555] normal-case">(optional — up to 3, revealed one at a time)</span>
        </label>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-[#555] w-12 shrink-0">Hint {i + 1}</span>
              <input
                value={(form.hints || [])[i] || ""}
                onChange={(e) => {
                  const next = [...(form.hints || ["", "", ""])];
                  while (next.length < 3) next.push("");
                  next[i] = e.target.value;
                  set("hints", next.filter((_, idx) => idx <= i || next[idx]));
                }}
                placeholder={
                  i === 0 ? "e.g. Think about what data structure allows O(1) lookups" :
                  i === 1 ? "e.g. What if you stored the complement of each number?" :
                             "e.g. A single pass through the array is sufficient"
                }
                className="flex-1 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40]"
              />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[#555] font-mono mt-1.5">
          Users unlock hints one-by-one with a 30s cooldown. Leave blank to disable hints for this problem.
        </p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[#bbb] font-mono uppercase tracking-wider">
            Test Cases
          </label>
          <button
            onClick={handleGenerateTests}
            disabled={generatingTests || !form.title.trim()}
            className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-lg
              bg-[#00e87a10] border border-[#00e87a25] text-[#00e87a]
              hover:bg-[#00e87a18] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {generatingTests
              ? <><span className="w-2.5 h-2.5 border border-[#00e87a] border-t-transparent rounded-full animate-spin inline-block mr-1" />Generating…</>
              : "✦ AI Generate"}
          </button>
        </div>
        {aiTestErr && (
          <p className="text-[10px] text-[#ff4d4d] font-mono mb-2">{aiTestErr}</p>
        )}
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
    const payload = {
      ...problemData,
      visibility: "arena",
      is_contest_problem: true,
    };
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
            label: "Duration (min)",
            key: "duration_mins",
            ph: "60",
            type: "number",
          },
        ].map(({ label, key, ph, type }) => (
          <div key={key}>
            <label className="block text-xs text-[#bbb] font-mono mb-1 uppercase tracking-wider">
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
          <label className="text-xs text-[#bbb] font-mono uppercase tracking-wider">
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
            <div className="text-xs text-[#999] font-mono py-2 text-center">
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
            <p className="text-[10px] text-[#999] font-mono mb-4">
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
        <label className="block text-xs text-[#bbb] font-mono mb-2 uppercase tracking-wider">
          Status
        </label>
        <div className="flex gap-2">
          {(["upcoming", "live", "ended"] as const).map((s) => (
            <button
              key={s}
              onClick={() => set("status", s)}
              className={`px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition-all capitalize
                ${form.status === s ? (s === "live" ? "bg-[#00e87a] text-black" : s === "upcoming" ? "bg-[#f0b429] text-black" : "bg-[#333] text-[#e0e0e0]") : "bg-[#1a1a1a] text-[#bbb] hover:text-[#e0e0e0]"}`}
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
        <span className="text-[10px] font-mono text-[#999] uppercase tracking-wider">
          {lang}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={copy}
            className="text-[10px] font-mono text-[#aaa] hover:text-[#00e87a] transition-colors"
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
    | "approve-weekly"
    | "reject-weekly"
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
    modal.type === "approve-sub" ||
    modal.type === "approve-arena" ||
    modal.type === "approve-weekly";

  useEffect(() => {
    if (modal.type === "approve-sub" || modal.type === "approve-weekly")
      setValue(String(modal.suggestedPoints ?? 100));
    if (modal.type === "approve-arena") {
      const sub = modal.arenaSubRef!;
      // Use the already-calculated points_awarded from submission time
      // which correctly factors in: testRatio × timeFactor × strikePenalty
      const suggested = sub.points_awarded > 0
        ? sub.points_awarded
        : Math.max(10, Math.floor((modal.basePoints ?? 100) * Math.max(0.7, 1 - (sub.strikes || 0) * 0.1) * (sub.strike_penalty_factor || 1)));
      setValue(String(suggested));
    }
    if (
      modal.type === "reject-sub" ||
      modal.type === "reject-arena" ||
      modal.type === "reject-weekly" ||
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
            : modal.type === "approve-weekly"
              ? `Approve weekly submission — @${modal.github}`
              : modal.type === "reject-weekly"
                ? `Reject weekly submission — @${modal.github}`
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
          <p className="text-xs text-[#aaa] font-mono mb-4">
            Points are auto-calculated from test results. Adjust before
            confirming.
          </p>
        )}
        {modal.type === "approve-arena" && modal.arenaSubRef && (
          <div className="mb-3 p-2.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg text-xs font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-[#999]">Tests passed</span>
              <span className={modal.arenaSubRef.tests_total > 0
                ? modal.arenaSubRef.tests_passed === modal.arenaSubRef.tests_total
                  ? "text-[#00e87a] font-bold"
                  : "text-[#f0b429] font-bold"
                : "text-[#555]"}>
                {modal.arenaSubRef.tests_total > 0
                  ? `${modal.arenaSubRef.tests_passed}/${modal.arenaSubRef.tests_total}`
                  : "not run"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999]">Strikes</span>
              <span className="text-[#f0b429]">{modal.arenaSubRef.strikes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999]">Time + strike factor</span>
              <span className="text-[#a78bfa]">
                {(modal.arenaSubRef.strike_penalty_factor || 1).toFixed(2)}×
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999]">Base pts</span>
              <span className="text-[#e0e0e0]">{modal.basePoints}</span>
            </div>
            <div className="flex justify-between border-t border-[#1f1f1f] pt-1 mt-1">
              <span className="text-[#999]">Calculated pts</span>
              <span className="text-[#00e87a] font-bold">{modal.arenaSubRef.points_awarded}</span>
            </div>
          </div>
        )}
        {modal.type === "confirm-delete" && (
          <p className="text-xs text-[#bbb] font-mono mb-4">
            {modal.confirmMsg}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          {isApprove && (
            <div>
              <label className="block text-[10px] text-[#999] font-mono uppercase mb-1">
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
            modal.type === "reject-weekly" ||
            modal.type === "reject-reg") && (
            <div>
              <label className="block text-[10px] text-[#999] font-mono uppercase mb-1">
                Reason{" "}
                <span className="normal-case text-[#ccc]">(optional)</span>
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
              className="px-4 py-2 rounded-lg text-xs font-mono text-[#999] hover:text-[#ccc] transition-all"
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
  const [weeklySubs, setWeeklySubs] = useState<any[]>([]);
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
  const [plagResults,    setPlagResults]    = useState<Record<string, any>>({});
  const [plagChecking,   setPlagChecking]   = useState<string | null>(null);
  const [expandedCode,   setExpandedCode]   = useState<string | null>(null);
  const [subFilter,      setSubFilter]      = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [subVisibleCount, setSubVisibleCount] = useState(20);

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
      { data: w },
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
      db
        .from("weekly_submissions")
        .select("*")
        .order("submitted_at", { ascending: false })
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
    setWeeklySubs(w || []);
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

  async function checkPlagiarism(sub: Submission) {
    if (plagChecking === sub.id) return;
    setPlagChecking(sub.id);
    try {
      // Fetch other submissions for the same problem
      const { data: others } = await (db.from("submissions") as any)
        .select("github, code")
        .eq("problem_id", sub.problem_id)
        .neq("github", sub.github)
        .in("status", ["pending", "approved"])
        .limit(10);

      const { detectPlagiarism } = await import("@/lib/gemini");
      const result = await detectPlagiarism(
        sub.code || "",
        sub.lang,
        (others || []).filter((o: any) => o.code),
      );
      setPlagResults(prev => ({ ...prev, [sub.id]: result }));
    } catch {
      setPlagResults(prev => ({ ...prev, [sub.id]: { score: 0, verdict: "clean", matches: [], explanation: "Check failed." } }));
    }
    setPlagChecking(null);
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
    { id: "feedback",    label: "💬 Feedback" },
    { id: "weekly",      label: "🏅 Weekly" },
    { id: "subscribers", label: "⭐ Subscribers" },
    { id: "ai-generate", label: "✦ AI Generate" },
    { id: "announcements", label: "📣 Announcements" },
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
        <div className="text-xs text-[#999] font-mono uppercase tracking-wider mb-3">
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
                ${section === n.id ? "bg-[#00e87a15] text-[#00e87a]" : "text-[#bbb] hover:text-[#e0e0e0]"}`}
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
          <div className="flex items-center gap-2 text-[#bbb] font-mono pt-4">
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
                      <div className="text-xs text-[#999] font-mono mt-1">
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="card p-5">
                  <div className="text-xs text-[#999] font-mono uppercase tracking-wider mb-3">
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
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                  <h2 className="font-display font-bold text-xl">
                    Submissions
                  </h2>
                  <div className="flex gap-3 text-xs font-mono">
                    <span className="text-[#f0b429]">
                      {subs.filter((s) => s.status === "pending").length}{" "}
                      pending
                    </span>
                    <span className="text-[#999]">·</span>
                    <span className="text-[#00e87a]">
                      {subs.filter((s) => s.status === "approved").length}{" "}
                      approved
                    </span>
                  </div>
                </div>

                {/* Status filter — defaults to Pending so approved/rejected
                    history doesn't clutter the view once volume grows */}
                <div className="flex flex-wrap gap-1 bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl p-1 w-fit mb-5">
                  {([
                    { id: "pending",  label: `Pending (${subs.filter(s => s.status === "pending").length})` },
                    { id: "approved", label: "Approved" },
                    { id: "rejected", label: "Rejected" },
                    { id: "all",      label: "All" },
                  ] as const).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => { setSubFilter(f.id); setSubVisibleCount(20); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-150
                        ${subFilter === f.id
                          ? "bg-[#00e87a10] text-[#00e87a] font-bold border border-[#00e87a20]"
                          : "text-[#666] hover:text-[#e0e0e0] hover:bg-[#ffffff06] border border-transparent"}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {(() => {
                  const filtered = subFilter === "all" ? subs : subs.filter((s) => s.status === subFilter);
                  const visible = filtered.slice(0, subVisibleCount);
                  return (
                    <>
                <div className="space-y-3">
                  {filtered.length === 0 && (
                    <div className="text-center py-16 text-[#999] font-mono">
                      No {subFilter !== "all" ? subFilter : ""} submissions.
                    </div>
                  )}
                  {visible.map((s) => (
                    <div
                      key={s.id}
                      className={`card p-4 transition-all ${s.status === "pending" ? "border-[#f0b42930]" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono font-bold text-[#e0e0e0]">
                            {s.problem_title}
                          </div>
                          <div className="text-xs text-[#bbb] font-mono mt-0.5">
                            @{s.github} · {s.lang} ·{" "}
                            {new Date(s.created_at).toLocaleString()}
                          </div>
                          {s.approach && (
                            <div className="text-xs text-[#ccc] mt-1.5 font-mono bg-[#0a0a0a] rounded px-2 py-1 max-w-lg">
                              <span className="text-[#999]">Approach: </span>
                              {s.approach}
                            </div>
                          )}
                          {s.tests_total > 0 && (
                            <div className="text-xs text-[#bbb] mt-1 font-mono">
                              Tests: {s.tests_passed}/{s.tests_total} ·
                              potential {s.points_awarded} pts
                            </div>
                          )}
                          {s.reject_reason && (
                            <div className="text-xs text-[#ff4d4d] mt-1 font-mono">
                              Reason: {s.reject_reason}
                            </div>
                          )}
                          {s.code && (
                            <div>
                              <CodeViewer code={s.code} lang={s.lang} />
                              {/* Plagiarism check */}
                              <div className="mt-2">
                                {!plagResults[s.id] ? (
                                  <button
                                    onClick={() => checkPlagiarism(s)}
                                    disabled={plagChecking === s.id}
                                    className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded-lg
                                      bg-[#f0b42910] border border-[#f0b42920] text-[#f0b429]
                                      hover:bg-[#f0b42918] disabled:opacity-50 transition-all"
                                  >
                                    {plagChecking === s.id ? (
                                      <><span className="w-2.5 h-2.5 border border-[#f0b429] border-t-transparent rounded-full animate-spin inline-block" /> Checking…</>
                                    ) : '✦ Check Plagiarism'}
                                  </button>
                                ) : (
                                  <div className={`rounded-xl p-3 border text-[10px] font-mono space-y-1.5
                                    ${plagResults[s.id].verdict === 'likely_plagiarised' ? 'bg-[#ff4d4d08] border-[#ff4d4d25]' :
                                      plagResults[s.id].verdict === 'suspicious'         ? 'bg-[#f0b42908] border-[#f0b42925]' :
                                                                                           'bg-[#00e87a08] border-[#00e87a20]'}`}>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className={
                                          plagResults[s.id].verdict === 'likely_plagiarised' ? 'text-[#ff4d4d]' :
                                          plagResults[s.id].verdict === 'suspicious'         ? 'text-[#f0b429]' : 'text-[#00e87a]'
                                        }>
                                          {plagResults[s.id].verdict === 'likely_plagiarised' ? '⚠ Likely plagiarised' :
                                           plagResults[s.id].verdict === 'suspicious'         ? '⚠ Suspicious' : '✓ Looks original'}
                                        </span>
                                        <span className="text-[#555]">
                                          Similarity: {plagResults[s.id].score}%
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => checkPlagiarism(s)}
                                        disabled={plagChecking === s.id}
                                        className="text-[#444] hover:text-[#f0b429] transition-colors"
                                      >
                                        ↻
                                      </button>
                                    </div>
                                    {plagResults[s.id].explanation && (
                                      <p className="text-[#888] leading-relaxed">{plagResults[s.id].explanation}</p>
                                    )}
                                    {plagResults[s.id].matches?.length > 0 && (
                                      <ul className="space-y-0.5 pl-2">
                                        {plagResults[s.id].matches.map((m: string, i: number) => (
                                          <li key={i} className="text-[#666] before:content-['•'] before:mr-1.5">{m}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
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
                {filtered.length > subVisibleCount && (
                  <div className="flex justify-center mt-5">
                    <button
                      onClick={() => setSubVisibleCount((n) => n + 20)}
                      className="px-4 py-2 bg-[#1a1a1a] text-[#aaa] text-xs font-mono rounded-xl hover:text-[#e0e0e0] hover:bg-[#222] transition-all"
                    >
                      Load {Math.min(20, filtered.length - subVisibleCount)} more
                      ({filtered.length - subVisibleCount} remaining)
                    </button>
                  </div>
                )}
                    </>
                  );
                })()}
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
                        <span className="text-[#999]">·</span>
                        <span className="text-[#00e87a]">
                          {
                            arenaSubs.filter((a) => a.status === "reviewed")
                              .length
                          }{" "}
                          reviewed
                        </span>
                      </div>
                    </div>
                    <div className="mb-4 p-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg text-xs font-mono text-[#bbb] space-y-1">
                      <div>
                        <span className="text-[#e0e0e0] font-bold">Points formula: </span>
                        base × (tests_passed / tests_total) × time_factor × (1 − strikes×0.1)
                      </div>
                      <div className="text-[#555]">
                        Auto-submitted (time expired) = 0 tests run → 0 pts by default. Review code manually and override if deserved.
                      </div>
                    </div>
                    {arenaSubs.length === 0 && (
                      <div className="text-center py-16 text-[#999] font-mono">
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
                                      className={`ml-2 text-[10px] font-mono px-2 py-0.5 rounded font-bold ${contest.status === "live" ? "bg-[#00e87a15] text-[#00e87a]" : contest.status === "upcoming" ? "bg-[#f0b42915] text-[#f0b429]" : "bg-[#33333318] text-[#bbb]"}`}
                                    >
                                      {contest.status}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-3 text-[10px] font-mono text-[#999]">
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
                                    // Sort submissions by problem order in contest
                                    const contestProbIds = contest
                                      ? (contest.problem_ids?.length ? contest.problem_ids : contest.problem_id ? [contest.problem_id] : [])
                                      : [];
                                    const sortedSubs = [...userSubs].sort((a, b) => {
                                      const ai = contestProbIds.indexOf(a.problem_id || '');
                                      const bi = contestProbIds.indexOf(b.problem_id || '');
                                      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                                    });
                                    return (
                                      <div key={github} className="px-5 py-4">
                                        {/* User header */}
                                        <div className="flex items-center gap-3 mb-3">
                                          <img
                                            src={`https://github.com/${github}.png?size=28`}
                                            alt={github}
                                            className="w-7 h-7 rounded-full ring-1 ring-[#2a2a2a] shrink-0"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-mono font-bold text-[#e0e0e0] text-sm">@{github}</span>
                                              <span className="text-[10px] text-[#555] font-mono">
                                                {sortedSubs.length}/{contestProbIds.length || '?'} problems submitted
                                              </span>
                                              {totalAwarded > 0 && (
                                                <span className="ml-auto text-xs font-mono text-[#00e87a] font-bold">
                                                  {totalAwarded} pts total
                                                </span>
                                              )}
                                              {pendingUserSubs.length > 0 && totalAwarded === 0 && (
                                                <span className="ml-auto text-[10px] font-mono text-[#f0b429]">
                                                  {pendingUserSubs.length} pending
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Per-problem submissions */}
                                        <div className="space-y-2 pl-10">
                                          {sortedSubs.map((a, subIdx) => {
                                            // Fix: look up in both problem_ids and legacy problem_id
                                            const probId = a.problem_id || null;
                                            const prob = probId
                                              ? probs.find((p) => p.id === probId)
                                              : null;
                                            const basePts = prob?.points || 200;
                                            const problemNum = contestProbIds.indexOf(a.problem_id || '') + 1;
                                            const codeKey = `${a.id}_code`;
                                            return (
                                              <div
                                                key={a.id}
                                                className={`bg-[#0d0d0d] border rounded-xl p-3 transition-all
                                                  ${a.status === "submitted"    ? "border-[#f0b42930]" :
                                                    a.status === "disqualified" ? "border-[#ff4d4d20]" :
                                                                                  "border-[#1a1a1a]"}`}
                                              >
                                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                                  <div className="min-w-0 flex-1">
                                                    {/* Problem label */}
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                      {problemNum > 0 && (
                                                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#a78bfa15] text-[#a78bfa]">
                                                          P{problemNum}
                                                        </span>
                                                      )}
                                                      <span className="text-sm font-mono text-[#e0e0e0] font-medium">
                                                        {prob?.title || a.problem_title || "Unknown Problem"}
                                                      </span>
                                                      <span className="text-[10px] text-[#555] font-mono">
                                                        {basePts} pts base
                                                      </span>
                                                      {a.tests_total === 0 && a.status === "submitted" && (
                                                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#444] text-[#999]">
                                                          ⏱ auto-submitted
                                                        </span>
                                                      )}
                                                      {a.strikes > 0 && (
                                                        <span className="text-[10px] font-mono bg-[#ff4d4d15] text-[#ff4d4d] px-1.5 py-0.5 rounded">
                                                          ⚠ {a.strikes} strikes
                                                        </span>
                                                      )}
                                                    </div>

                                                    {/* Meta */}
                                                    <div className="text-[10px] text-[#666] font-mono">
                                                      {a.lang} · {new Date(a.created_at).toLocaleString()}
                                                      {a.tests_total > 0 && (
                                                        <span className={`ml-2 font-bold ${a.tests_passed === a.tests_total ? 'text-[#00e87a]' : 'text-[#f0b429]'}`}>
                                                          {a.tests_passed}/{a.tests_total} tests
                                                        </span>
                                                      )}
                                                      {a.tests_total === 0 && (
                                                        <span className="ml-2 text-[#444]">no tests run</span>
                                                      )}
                                                      {a.strike_penalty_factor && a.strike_penalty_factor !== 1 && (
                                                        <span className="ml-2 text-[#a78bfa]">
                                                          ×{a.strike_penalty_factor.toFixed(2)} factor
                                                        </span>
                                                      )}
                                                    </div>

                                                    {a.points_awarded > 0 && a.status === "reviewed" && (
                                                      <div className="text-xs text-[#00e87a] font-mono mt-0.5 font-bold">
                                                        ✓ Awarded: {a.points_awarded} pts
                                                      </div>
                                                    )}

                                                    {/* Collapsible code */}
                                                    {a.code && a.code !== '-- No code submitted --' && a.code !== '-- Time expired before submission --' ? (
                                                      <div className="mt-2">
                                                        <button
                                                          onClick={() => setExpandedCode(expandedCode === codeKey ? null : codeKey)}
                                                          className="text-[10px] font-mono text-[#555] hover:text-[#a78bfa] transition-colors"
                                                        >
                                                          {expandedCode === codeKey ? "▲ hide code" : "▼ view code"}
                                                        </button>
                                                        {expandedCode === codeKey && (
                                                          <CodeViewer code={a.code} lang={a.lang} />
                                                        )}
                                                      </div>
                                                    ) : (
                                                      <div className="text-[10px] font-mono text-[#444] mt-1 italic">
                                                        {a.code || 'No code submitted'}
                                                      </div>
                                                    )}
                                                  </div>

                                                  {/* Actions */}
                                                  <div className="flex items-center gap-2 shrink-0">
                                                    <span className={`text-xs font-mono px-2 py-0.5 rounded font-bold
                                                      ${a.status === "reviewed"     ? "bg-[#00e87a15] text-[#00e87a]" :
                                                        a.status === "disqualified" ? "bg-[#ff4d4d15] text-[#ff4d4d]" :
                                                                                      "bg-[#f0b42915] text-[#f0b429]"}`}>
                                                      {a.status}
                                                    </span>
                                                    {a.status === "submitted" && (
                                                      <>
                                                        <button
                                                          onClick={() => approveArenaSubmission(a, basePts)}
                                                          className="px-3 py-1.5 bg-[#00e87a] text-black text-xs font-mono font-bold rounded-lg hover:bg-[#00ff88] transition-all"
                                                        >
                                                          ✓ Approve
                                                        </button>
                                                        <button
                                                          onClick={() => rejectArenaSubmission(a.id, a.github)}
                                                          className="px-3 py-1.5 bg-[#ff4d4d20] text-[#ff4d4d] text-xs font-mono rounded-lg hover:bg-[#ff4d4d30] transition-all"
                                                        >
                                                          ✗ Reject
                                                        </button>
                                                      </>
                                                    )}
                                                    {a.status === "reviewed" && (
                                                      expandedCode === `${a.id}_editpts` ? (
                                                        <div className="flex items-center gap-1.5">
                                                          <input
                                                            type="number"
                                                            defaultValue={a.points_awarded}
                                                            className="w-16 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-2 py-1 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
                                                            onKeyDown={async (e) => {
                                                              if (e.key === 'Enter') {
                                                                const pts = Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0);
                                                                await (db.from('arena_submissions') as any)
                                                                  .update({ points_awarded: pts })
                                                                  .eq('id', a.id);
                                                                // Update local state so UI reflects change without full reload
                                                                setArenaSubs(prev => prev.map(s =>
                                                                  s.id === a.id ? { ...s, points_awarded: pts } : s
                                                                ));
                                                                setExpandedCode(null);
                                                              }
                                                              if (e.key === 'Escape') setExpandedCode(null);
                                                            }}
                                                            autoFocus
                                                          />
                                                          <button
                                                            onClick={() => setExpandedCode(null)}
                                                            className="text-[10px] font-mono text-[#555] hover:text-[#999]"
                                                          >✕</button>
                                                        </div>
                                                      ) : (
                                                        <button
                                                          onClick={() => setExpandedCode(`${a.id}_editpts`)}
                                                          className="text-[10px] font-mono text-[#555] hover:text-[#a78bfa] transition-colors"
                                                        >
                                                          ✎ edit pts
                                                        </button>
                                                      )
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}

                                          {/* Show missing problems — submitted but no record */}
                                          {contestProbIds.filter(pid => !sortedSubs.find(s => s.problem_id === pid)).map(pid => {
                                            const prob = probs.find(p => p.id === pid);
                                            const problemNum = contestProbIds.indexOf(pid) + 1;
                                            return (
                                              <div key={pid} className="bg-[#0a0a0a] border border-[#1a1a1a] border-dashed rounded-xl p-3 opacity-50">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#ffffff10] text-[#666]">
                                                    P{problemNum}
                                                  </span>
                                                  <span className="text-xs font-mono text-[#555]">
                                                    {prob?.title || `Problem ${problemNum}`}
                                                  </span>
                                                  <span className="text-[10px] font-mono text-[#444] ml-auto">
                                                    Not submitted
                                                  </span>
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
                    <div className="text-center py-16 text-[#999] font-mono">
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
                          <span className="text-[10px] text-[#999] font-mono">
                            {(p.test_cases || []).length} tests
                          </span>
                          {(p.tags || []).map((t) => (
                            <span
                              key={t}
                              className="text-[10px] text-[#999] bg-[#0f0f0f] px-1.5 py-0.5 rounded font-mono"
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
                          className="px-3 py-1.5 bg-[#1a1a1a] text-[#ccc] hover:text-[#00e87a] text-xs font-mono rounded-lg transition-all border border-[#2a2a2a]"
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
                    <div className="text-center py-16 text-[#999] font-mono">
                      No members yet.
                    </div>
                  )}
                  {members.map((m, i) => (
                    <div
                      key={m.id}
                      className={`card px-5 py-4 flex items-center gap-4 ${i === 0 ? "border-[#00e87a40]" : i === 1 ? "border-[#a78bfa30]" : i === 2 ? "border-[#f0b42930]" : ""}`}
                    >
                      <div className="w-8 text-center font-mono font-bold text-sm shrink-0 text-[#999]">
                        {i === 0 ? "👑" : `#${i + 1}`}
                      </div>
                      <div className="w-8 h-8 bg-[#1a1a1a] rounded-full flex items-center justify-center font-display font-bold text-[#00e87a] text-sm shrink-0">
                        {(m.name || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[#e0e0e0] truncate">
                          {m.name}
                        </div>
                        <div className="text-xs text-[#999] font-mono">
                          @{m.github}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-[#00e87a]">
                          {m.total_points} XP
                        </div>
                        <div className="text-xs text-[#999] font-mono">
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
                <div className="space-y-3">
                  {contests.length === 0 && !showContestForm && (
                    <div className="text-center py-16 text-[#999] font-mono">
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
                          <div className="text-xs text-[#bbb] font-mono mt-0.5">
                            Free for subscribers · {c.duration_mins}m
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
                                ${c.status === s ? (s === "live" ? "bg-[#00e87a] text-black font-bold" : s === "upcoming" ? "bg-[#f0b429] text-black font-bold" : "bg-[#333] text-[#e0e0e0] font-bold") : "text-[#999] hover:text-[#bbb] border border-[#2a2a2a]"}`}
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
                            className="px-3 py-1 bg-[#1a1a1a] text-[#ccc] hover:text-[#a78bfa] text-xs font-mono rounded-lg transition-all border border-[#2a2a2a]"
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
                      {regs.filter((r) => r.contest_id === c.id).length > 0 && (() => {
                        const contestRegs = regs.filter((r) => r.contest_id === c.id);
                        const confirmedCount = contestRegs.filter((r) => r.status === "confirmed").length;
                        return (
                          <div className="pt-3 border-t border-[#1a1a1a]">
                            <div className="text-[10px] text-[#999] font-mono mb-1.5 uppercase">
                              Registrations ({confirmedCount}/70 seats)
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {contestRegs.map((r) => (
                                <span
                                  key={r.id}
                                  className={`group text-[10px] font-mono pl-2 pr-1 py-0.5 rounded flex items-center gap-1
                                    ${r.status === "confirmed" ? "bg-[#00e87a15] text-[#00e87a]" : "bg-[#ff4d4d15] text-[#ff4d4d]"}`}
                                >
                                  @{r.github}
                                  {r.status === "confirmed" && (
                                    <button
                                      onClick={() => rejectReg(r.id)}
                                      title="Remove registrant"
                                      className="opacity-50 hover:opacity-100 hover:text-[#ff4d4d] transition-all px-1"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════ WEEKLY CHALLENGE SECTION ════════ */}
        {section === "feedback"    && <FeedbackAdminSection />}
        {section === "weekly"      && <WeeklyAdminSection user={user} />}
        {section === "subscribers" && <SubscriberAdminSection />}
        {section === "ai-generate" && <AiGenerateSection />}
        {section === "announcements" && <AnnouncementAdminSection />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Weekly Challenge Admin Section
// ════════════════════════════════════════════════════════════

// Convert a Date to the value format datetime-local expects: "YYYY-MM-DDTHH:mm" in LOCAL time
function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function blankWeekly(): Omit<WeeklyChallenge, "id" | "created_at"> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return {
    title: "",
    description: "",
    problem_ids: [],
    entry_fee: 0, // unused — weekly challenges have no payment gate
    upi_id: "", // unused — kept for legacy schema compatibility only
    whatsapp_link: null,
    starts_at: toLocalDatetimeInput(now),
    ends_at: toLocalDatetimeInput(end),
    status: "upcoming",
  };
}

function WeeklyAdminSection({ user }: { user: User }) {
  const db = getSupabaseClient();

  const [challenges, setChallenges] = useState<WeeklyChallenge[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [form, setForm] = useState<Omit<
    WeeklyChallenge,
    "id" | "created_at"
  > | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingPts, setEditingPts] = useState<Record<string, string>>({});
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [weeklyPlagResults, setWeeklyPlagResults] = useState<Record<string, any>>({});
  const [weeklyPlagChecking, setWeeklyPlagChecking] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: null, id: "", github: "" });
  const modalResolve = useRef<((v: string | null) => void) | null>(null);

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
    modalResolve.current?.(null);
    modalResolve.current = null;
    setModal({ type: null, id: "", github: "" });
  }

  useEffect(() => {
    load();
  }, []);

  async function load() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: ch }, { data: probs }, { data: subs }] =
      await Promise.all([
        (db.from("weekly_challenges") as any)
          .select("*")
          .order("created_at", { ascending: false }),
        db
          .from("problems")
          .select("id, title, difficulty, points")
          .order("title"),
        (db.from("weekly_submissions") as any)
          .select("*")
          .order("submitted_at", { ascending: false }),
      ]);
    setChallenges((ch || []) as WeeklyChallenge[]);
    setProblems((probs || []) as Problem[]);
    setSubmissions(subs || []);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  function startCreate() {
    setEditId(null);
    setForm(blankWeekly());
  }

  function startEdit(ch: WeeklyChallenge) {
    setEditId(ch.id);
    setForm({
      title: ch.title,
      description: ch.description,
      problem_ids: ch.problem_ids || [],
      entry_fee: ch.entry_fee,
      upi_id: ch.upi_id,
      whatsapp_link: ch.whatsapp_link || null,
      starts_at: toLocalDatetimeInput(new Date(ch.starts_at)),
      ends_at: toLocalDatetimeInput(new Date(ch.ends_at)),
      status: ch.status,
    });
  }

  async function saveForm() {
    if (!form) return;
    if (!form.title.trim()) {
      showToast("Title required");
      return;
    }
    if (form.problem_ids.length === 0) {
      showToast("Select at least 1 problem");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
      };
      if (editId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (db.from("weekly_challenges") as any)
          .update(payload)
          .eq("id", editId);
        if (error) throw error;
        showToast("Updated ✓");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (db.from("weekly_challenges") as any).insert(
          payload,
        );
        if (error) throw error;

        // Access is automatic for all confirmed subscribers — nothing
        // else to do here.
        showToast("Created ✓");
      }
      setForm(null);
      setEditId(null);
      load();
    } catch (e: any) {
      showToast("Error: " + (e.message || "Unknown"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteChallenge(id: string) {
    const result = await openModal({
      type: "confirm-delete",
      id,
      github: "",
      confirmMsg: "Delete this weekly challenge? This cannot be undone.",
    });
    if (result === null) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("weekly_challenges") as any).delete().eq("id", id);
    load();
  }

  async function updatePoints(subId: string, newPts: string) {
    const pts = parseInt(newPts, 10);
    if (isNaN(pts) || pts < 0) {
      showToast("Enter a valid number");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from("weekly_submissions") as any)
      .update({ points_awarded: pts })
      .eq("id", subId);
    if (error) {
      showToast("Update failed");
      return;
    }
    setEditingPts((prev) => {
      const n = { ...prev };
      delete n[subId];
      return n;
    });
    showToast("Points updated ✓");
    load();
  }

  async function approveWeeklySubmission(sub: any) {
    if (sub.status === "approved") {
      showToast("Already approved");
      return;
    }

    const finalStr = await openModal({
      type: "approve-weekly",
      id: sub.id,
      github: sub.github,
      suggestedPoints: sub.points_awarded,
    });

    if (finalStr === null) return;

    const finalPts = Math.max(0, parseInt(finalStr, 10) || 0);

    const { error } = await (db.from("weekly_submissions") as any)
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        points_awarded: finalPts,
      })
      .eq("id", sub.id);

    if (error) {
      showToast("Approval failed");
      return;
    }

    // ===== UPDATE MEMBERS TABLE =====

    const { data: member } = await (db
      .from("members") as any)
      .select("*")
      .eq("github", sub.github)
      .maybeSingle();

    if (member) {
      await (db
        .from("members") as any)
        .update({
          total_points: (member.total_points || 0) + finalPts,
          problems_solved: (member.problems_solved || 0) + 1,
          last_solved_at: new Date().toISOString(),
        })
        .eq("github", sub.github);
    } else {
      await (db.from("members") as any).insert({
        github: sub.github,
        name: sub.name,
        total_points: finalPts,
        problems_solved: 1,
        streak: 1,
        last_solved_at: new Date().toISOString(),
      });
    }

    showToast(`Approved ${sub.github} (${finalPts} pts)`);

    load();
  }

  async function rejectWeeklySubmission(sub: any) {
    const reason = await openModal({ type: "reject-weekly", id: sub.id, github: sub.github });
    if (reason === null) return;

    const { error } = await (db.from("weekly_submissions") as any)
      .update({
        status: "rejected",
        review_notes: (reason as string).trim() || "Rejected",
      })
      .eq("id", sub.id);

    if (error) {
      showToast("Reject failed");
      return;
    }

    showToast(`Rejected ${sub.github}`);

    load();
  }

  async function bulkApproveSelected(pendingSubs: any[]) {
    const toApprove = pendingSubs.filter((s) => selectedSubs.has(s.id));
    if (toApprove.length === 0) return;

    setBulkApproving(true);
    let done = 0;
    for (const sub of toApprove) {
      await approveWeeklySubmission(sub);
      done++;
      showToast(`Approved ${done}/${toApprove.length} — @${sub.github}`);
    }
    setSelectedSubs(new Set());
    setBulkApproving(false);
    showToast(`✓ Bulk approved ${done} submission${done !== 1 ? "s" : ""}`);
  }

  async function checkWeeklyPlagiarism(sub: any) {
    if (weeklyPlagChecking === sub.id) return;
    setWeeklyPlagChecking(sub.id);
    try {
      const { data: others } = await (db.from("weekly_submissions") as any)
        .select("github, code")
        .eq("problem_id", sub.problem_id)
        .neq("github", sub.github)
        .in("status", ["pending", "approved"])
        .limit(10);

      const { detectPlagiarism } = await import("@/lib/gemini");
      const result = await detectPlagiarism(
        sub.code || "",
        sub.lang,
        (others || []).filter((o: any) => o.code),
      );
      setWeeklyPlagResults(prev => ({ ...prev, [sub.id]: result }));
    } catch {
      setWeeklyPlagResults(prev => ({ ...prev, [sub.id]: { score: 0, verdict: "clean", matches: [], explanation: "Check failed." } }));
    }
    setWeeklyPlagChecking(null);
  }

  function toggleProblem(id: string) {
    if (!form) return;
    const ids = form.problem_ids;
    if (ids.includes(id)) {
      setForm({ ...form, problem_ids: ids.filter((x) => x !== id) });
    } else {
      setForm({ ...form, problem_ids: [...ids, id] });
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {modal.type && (
        <ActionModal
          modal={modal}
          onConfirm={closeModal}
          onCancel={cancelModal}
        />
      )}
      {toast && (
        <div className="fixed top-20 right-4 z-[200] px-4 py-2 bg-[#00e87a] text-black font-mono text-sm rounded-xl shadow-xl">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono font-bold text-[#e0e0e0] text-base">
            Weekly Challenge
          </h2>
          <p className="text-[10px] text-[#999] font-mono mt-0.5">
            Create paid weekly problem sets with time-bonus scoring.
          </p>
        </div>
        {!form && (
          <button
            onClick={startCreate}
            className="px-4 py-2 bg-[#00e87a20] text-[#00e87a] font-mono text-sm rounded-xl hover:bg-[#00e87a30] transition-all"
          >
            + New Challenge
          </button>
        )}
      </div>

      {/* Form */}
      {form && (
        <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-2xl p-5 space-y-4">
          <h3 className="font-mono font-bold text-[#e0e0e0] text-sm">
            {editId ? "Edit" : "New"} Weekly Challenge
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#999] font-mono uppercase">
                Title *
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Week 1 — Arrays"
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40]"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-[#999] font-mono uppercase">
                Description
              </label>
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Brief description shown to users"
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#999] font-mono uppercase">
                WhatsApp Group Link
              </label>
              <input
                value={(form as any).whatsapp_link || ""}
                onChange={(e) =>
                  setForm({ ...form, whatsapp_link: e.target.value } as any)
                }
                placeholder="https://chat.whatsapp.com/..."
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40]"
              />
              <p className="text-[10px] text-[#999] font-mono mt-1">
                Shown to users only after payment is confirmed.
              </p>
            </div>
            <div>
              <label className="text-[10px] text-[#999] font-mono uppercase">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as any })
                }
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none"
              >
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[#999] font-mono uppercase">
                Starts At
              </label>
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) =>
                  setForm({ ...form, starts_at: e.target.value })
                }
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#999] font-mono uppercase">
                Ends At
              </label>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="w-full mt-1 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none"
              />
            </div>
          </div>

          {!editId && (
            <div className="border-t border-[#1a1a1a] pt-4">
              <div className="flex items-start gap-2 px-3 py-2.5 bg-[#00e87a08] border border-[#00e87a20] rounded-xl">
                <span className="text-[#00e87a] text-sm">⭐</span>
                <p className="text-[10px] text-[#999] font-mono leading-relaxed">
                  <span className="text-[#00e87a] font-bold">Access is automatic for subscribers.</span>{" "}
                  Anyone with a confirmed lifetime subscription gets this challenge instantly — no
                  per-challenge payment or setup needed.
                </p>
              </div>
            </div>
          )}

          {/* Problem picker */}
          <div>
            <label className="text-[10px] text-[#999] font-mono uppercase">
              Problems — {form.problem_ids.length} selected
            </label>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
              {problems.map((p) => {
                const selected = form.problem_ids.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleProblem(p.id)}
                    className={`text-left px-3 py-2 rounded-xl border text-xs font-mono transition-all
                      ${
                        selected
                          ? "border-[#00e87a40] bg-[#00e87a10] text-[#00e87a]"
                          : "border-[#1f1f1f] text-[#ccc] hover:border-[#2a2a2a] hover:text-[#e0e0e0]"
                      }`}
                  >
                    {selected ? "✓ " : "  "}
                    {p.title}
                    <span
                      className={`ml-2 text-[10px] ${p.difficulty === "Easy" ? "text-[#00e87a]" : p.difficulty === "Medium" ? "text-[#f0b429]" : "text-[#ff4d4d]"}`}
                    >
                      {p.difficulty}
                    </span>
                    <span className="ml-1 text-[#a78bfa]">{p.points}pt</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                setForm(null);
                setEditId(null);
              }}
              className="flex-1 py-2 bg-[#1a1a1a] text-[#bbb] font-mono text-sm rounded-xl hover:text-[#e0e0e0]"
            >
              Cancel
            </button>
            <button
              onClick={saveForm}
              disabled={saving}
              className="flex-1 py-2 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl hover:bg-[#00ff88] disabled:opacity-50"
            >
              {saving
                ? "Saving…"
                : editId
                  ? "Save Changes"
                  : "Create Challenge"}
            </button>
          </div>
        </div>
      )}

      {/* Challenges list */}
      {challenges.length === 0 && !form && (
        <div className="text-center py-12 text-[#999] font-mono text-sm">
          No weekly challenges yet.
        </div>
      )}

      <div className="space-y-4">
        {challenges.map((ch) => {
          const isOpen = expandedId === ch.id;

          return (
            <div
              key={ch.id}
              className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-2xl overflow-hidden"
            >
              <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-[#e0e0e0] text-sm">
                      {ch.title}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-lg ${ch.status === "active" ? "bg-[#00e87a15] text-[#00e87a]" : ch.status === "upcoming" ? "bg-[#f0b42915] text-[#f0b429]" : "bg-[#ff4d4d15] text-[#ff4d4d]"}`}
                    >
                      {ch.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#999] font-mono mt-1">
                    Free for subscribers ·{" "}
                    {new Date(ch.starts_at).toLocaleDateString()} –{" "}
                    {new Date(ch.ends_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : ch.id)}
                    className="text-xs font-mono text-[#aaa] hover:text-[#e0e0e0] px-3 py-1.5 bg-[#1a1a1a] rounded-lg"
                  >
                    {isOpen ? "Collapse" : "Manage"}
                  </button>
                  <button
                    onClick={() => startEdit(ch)}
                    className="text-xs font-mono text-[#a78bfa] hover:text-[#c4b5fd] px-3 py-1.5 bg-[#a78bfa15] rounded-lg"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteChallenge(ch.id)}
                    className="text-xs font-mono text-[#ff4d4d] px-3 py-1.5 bg-[#ff4d4d15] rounded-lg hover:bg-[#ff4d4d25]"
                  >
                    Del
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-[#1a1a1a] px-5 py-4">
                  {/* Submissions — payments tab removed (using subscriber model) */}
                  {(() => {
                      const chSubs = submissions.filter(
                        (s) => s.weekly_challenge_id === ch.id,
                      );
                      if (chSubs.length === 0) {
                        return (
                          <p className="text-xs text-[#ccc] font-mono">
                            No submissions yet.
                          </p>
                        );
                      }

                      // Keep only the latest submission per person per problem (safety dedup)
                      const latestPerKey = new Map<string, any>();
                      for (const s of chSubs) {
                        const key = `${s.github}::${s.problem_id}`;
                        const existing = latestPerKey.get(key);
                        if (!existing || new Date(s.submitted_at) > new Date(existing.submitted_at)) {
                          latestPerKey.set(key, s);
                        }
                      }
                      // Group by github handle, preserving order of first appearance
                      const byUser = new Map<string, any[]>();
                      for (const s of Array.from(latestPerKey.values())) {
                        if (!byUser.has(s.github)) byUser.set(s.github, []);
                        byUser.get(s.github)!.push(s);
                      }

                      const pendingSubsList = Array.from(latestPerKey.values()).filter((s: any) => s.status === "pending");
                      const allPendingSelected = pendingSubsList.length > 0 && pendingSubsList.every((s: any) => selectedSubs.has(s.id));
                      const somePendingSelected = pendingSubsList.some((s: any) => selectedSubs.has(s.id));

                      return (
                        <div className="space-y-4">
                          {/* Bulk action bar */}
                          {somePendingSelected && (
                            <div className="flex items-center justify-between px-4 py-3 bg-[#00e87a08] border border-[#00e87a20] rounded-2xl">
                              <span className="text-xs font-mono text-[#00e87a]">
                                {Array.from(selectedSubs).filter(id => pendingSubsList.some((s: any) => s.id === id)).length} submission{Array.from(selectedSubs).filter(id => pendingSubsList.some((s: any) => s.id === id)).length !== 1 ? "s" : ""} selected
                              </span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setSelectedSubs(new Set())}
                                  className="text-[10px] font-mono text-[#666] bg-[#1a1a1a] px-3 py-1.5 rounded-lg hover:text-[#aaa]"
                                >
                                  Clear
                                </button>
                                <button
                                  onClick={() => bulkApproveSelected(pendingSubsList)}
                                  disabled={bulkApproving}
                                  className="text-[10px] font-mono text-black bg-[#00e87a] px-3 py-1.5 rounded-lg font-bold hover:bg-[#00ff88] disabled:opacity-50 flex items-center gap-1.5"
                                >
                                  {bulkApproving ? (
                                    <><span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin inline-block" /> Approving…</>
                                  ) : "✓ Approve All Selected"}
                                </button>
                              </div>
                            </div>
                          )}

                          {Array.from(byUser.entries()).map(([github, userSubs]) => {
                            const totalPts = userSubs.reduce((sum: number, s: any) => sum + (s.points_awarded || 0), 0);
                            const pendingCount = userSubs.filter((s: any) => s.status === "pending").length;
                            const firstSub = userSubs[0];

                            return (
                              <div key={github} className="border border-[#1f1f1f] rounded-2xl overflow-hidden">
                                {/* Person header */}
                                <div className="flex items-center justify-between px-4 py-3 bg-[#111] border-b border-[#1a1a1a]">
                                  <div className="flex items-center gap-2.5">
                                    <img
                                      src={`https://github.com/${github}.png?size=28`}
                                      className="w-7 h-7 rounded-full shrink-0 ring-1 ring-[#2a2a2a]"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                    <div>
                                      <span className="text-xs font-mono font-bold text-[#e0e0e0]">{firstSub.name}</span>
                                      <span className="text-[10px] font-mono text-[#555] ml-1.5">@{github}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {pendingCount > 0 && (
                                      <span className="text-[10px] font-mono bg-[#f0b42920] text-[#f0b429] px-2 py-0.5 rounded-lg">
                                        {pendingCount} pending
                                      </span>
                                    )}
                                    <span className="text-[10px] font-mono bg-[#a78bfa20] text-[#a78bfa] px-2 py-0.5 rounded-lg">
                                      {userSubs.length} problem{userSubs.length !== 1 ? "s" : ""}
                                    </span>
                                    <span className="text-xs font-mono font-bold text-[#00e87a]">
                                      {totalPts} pts
                                    </span>
                                  </div>
                                </div>

                                {/* This person's submissions — one row per problem */}
                                <div className="divide-y divide-[#141414]">
                                  {/* Column header */}
                                  <div className="hidden sm:grid grid-cols-[1.5rem_1fr_5rem_4rem_4rem_5rem_7rem] gap-3 px-4 py-1.5 text-[10px] text-[#444] font-mono uppercase tracking-widest">
                                    <div className="flex items-center">
                                      {pendingCount > 0 && (
                                        <input
                                          type="checkbox"
                                          checked={userSubs.filter((s: any) => s.status === "pending").every((s: any) => selectedSubs.has(s.id))}
                                          onChange={(e) => {
                                            const pending = userSubs.filter((s: any) => s.status === "pending");
                                            setSelectedSubs(prev => {
                                              const next = new Set(prev);
                                              pending.forEach((s: any) => e.target.checked ? next.add(s.id) : next.delete(s.id));
                                              return next;
                                            });
                                          }}
                                          className="w-3 h-3 accent-[#00e87a] cursor-pointer"
                                          title="Select all pending for this user"
                                        />
                                      )}
                                    </div>
                                    <div>Problem</div>
                                    <div>Lang</div>
                                    <div>Tests</div>
                                    <div>Day</div>
                                    <div className="text-center">Points</div>
                                    <div className="text-center">Actions</div>
                                  </div>

                                  {userSubs.map((s: any) => {
                                    const isEditing = editingPts[s.id] !== undefined;
                                    const daysSince = Math.floor(
                                      (Date.now() - new Date(s.submitted_at).getTime()) / 86400000,
                                    );
                                    const statusColor =
                                      s.status === "approved"
                                        ? "text-[#00e87a]"
                                        : s.status === "rejected"
                                        ? "text-[#ff4d4d]"
                                        : "text-[#f0b429]";

                                    return (
                                      <div
                                        key={s.id}
                                        className={`grid grid-cols-1 sm:grid-cols-[1.5rem_1fr_5rem_4rem_4rem_5rem_7rem] gap-3 items-center px-4 py-2.5 transition-colors
                                          ${selectedSubs.has(s.id) ? "bg-[#00e87a06]" : "hover:bg-[#0d0d0d]"}`}
                                      >
                                        {/* Checkbox — only for pending */}
                                        <div className="hidden sm:flex items-center">
                                          {s.status === "pending" && (
                                            <input
                                              type="checkbox"
                                              checked={selectedSubs.has(s.id)}
                                              onChange={(e) => {
                                                setSelectedSubs(prev => {
                                                  const next = new Set(prev);
                                                  e.target.checked ? next.add(s.id) : next.delete(s.id);
                                                  return next;
                                                });
                                              }}
                                              className="w-3 h-3 accent-[#00e87a] cursor-pointer"
                                            />
                                          )}
                                        </div>
                                        {/* Problem title + status badge + code toggle */}
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-xs font-mono text-[#e0e0e0] truncate">
                                              {s.problem_title}
                                            </span>
                                            <span className={`text-[9px] font-mono uppercase ${statusColor} shrink-0`}>
                                              {s.status}
                                            </span>
                                            {s.code && (
                                              <button
                                                onClick={() => setExpandedCode(expandedCode === s.id ? null : s.id)}
                                                className="text-[9px] font-mono text-[#555] hover:text-[#a78bfa] transition-colors shrink-0"
                                              >
                                                {expandedCode === s.id ? "▲ hide code" : "▼ view code"}
                                              </button>
                                            )}
                                          </div>
                                          {/* Code viewer + plagiarism — expanded */}
                                          {expandedCode === s.id && s.code && (
                                            <div className="mt-2 col-span-full">
                                              <CodeViewer code={s.code} lang={s.lang} />
                                              {/* Plagiarism check */}
                                              <div className="mt-2">
                                                {!weeklyPlagResults[s.id] ? (
                                                  <button
                                                    onClick={() => checkWeeklyPlagiarism(s)}
                                                    disabled={weeklyPlagChecking === s.id}
                                                    className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded-lg
                                                      bg-[#f0b42910] border border-[#f0b42920] text-[#f0b429]
                                                      hover:bg-[#f0b42918] disabled:opacity-50 transition-all"
                                                  >
                                                    {weeklyPlagChecking === s.id
                                                      ? <><span className="w-2.5 h-2.5 border border-[#f0b429] border-t-transparent rounded-full animate-spin inline-block" /> Checking…</>
                                                      : "✦ Check Plagiarism"}
                                                  </button>
                                                ) : (
                                                  <div className={`rounded-xl p-3 border text-[10px] font-mono space-y-1.5
                                                    ${weeklyPlagResults[s.id].verdict === "likely_plagiarised" ? "bg-[#ff4d4d08] border-[#ff4d4d25]" :
                                                      weeklyPlagResults[s.id].verdict === "suspicious"        ? "bg-[#f0b42908] border-[#f0b42925]" :
                                                                                                                "bg-[#00e87a08] border-[#00e87a20]"}`}>
                                                    <div className="flex items-center justify-between">
                                                      <div className="flex items-center gap-2">
                                                        <span className={
                                                          weeklyPlagResults[s.id].verdict === "likely_plagiarised" ? "text-[#ff4d4d]" :
                                                          weeklyPlagResults[s.id].verdict === "suspicious"        ? "text-[#f0b429]" : "text-[#00e87a]"
                                                        }>
                                                          {weeklyPlagResults[s.id].verdict === "likely_plagiarised" ? "⚠ Likely plagiarised" :
                                                           weeklyPlagResults[s.id].verdict === "suspicious"        ? "⚠ Suspicious" : "✓ Looks original"}
                                                        </span>
                                                        <span className="text-[#555]">
                                                          Similarity: {weeklyPlagResults[s.id].score}%
                                                        </span>
                                                      </div>
                                                      <button
                                                        onClick={() => checkWeeklyPlagiarism(s)}
                                                        disabled={weeklyPlagChecking === s.id}
                                                        className="text-[#444] hover:text-[#f0b429] transition-colors"
                                                      >↻</button>
                                                    </div>
                                                    {weeklyPlagResults[s.id].explanation && (
                                                      <p className="text-[#888] leading-relaxed">{weeklyPlagResults[s.id].explanation}</p>
                                                    )}
                                                    {weeklyPlagResults[s.id].matches?.length > 0 && (
                                                      <ul className="space-y-0.5 pl-2">
                                                        {weeklyPlagResults[s.id].matches.map((m: string, i: number) => (
                                                          <li key={i} className="text-[#666] before:content-['•'] before:mr-1.5">{m}</li>
                                                        ))}
                                                      </ul>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </div>

                                        <div className="text-[10px] font-mono text-[#aaa]">{s.lang}</div>

                                        <div className="text-[10px] font-mono text-[#ccc]">
                                          {s.tests_passed}/{s.tests_total}
                                        </div>

                                        <div className="text-[10px] font-mono text-[#999]">
                                          Day {daysSince + 1}
                                        </div>

                                        {/* Points — editable */}
                                        <div className="text-center">
                                          {isEditing ? (
                                            <input
                                              type="number"
                                              min="0"
                                              value={editingPts[s.id]}
                                              onChange={(e) =>
                                                setEditingPts((prev) => ({ ...prev, [s.id]: e.target.value }))
                                              }
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") updatePoints(s.id, editingPts[s.id]);
                                                if (e.key === "Escape")
                                                  setEditingPts((prev) => { const n = { ...prev }; delete n[s.id]; return n; });
                                              }}
                                              className="w-16 bg-[#111] border border-[#00e87a40] rounded-lg px-2 py-1 text-xs font-mono text-[#00e87a] text-center focus:outline-none"
                                              autoFocus
                                            />
                                          ) : (
                                            <span className="text-sm font-mono font-bold text-[#a78bfa]">
                                              {s.points_awarded}
                                            </span>
                                          )}
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex justify-center gap-1 flex-wrap">
                                          {isEditing ? (
                                            <>
                                              <button
                                                onClick={() => updatePoints(s.id, editingPts[s.id])}
                                                className="text-[10px] font-mono text-[#00e87a] bg-[#00e87a15] px-2 py-1 rounded-lg hover:bg-[#00e87a25]"
                                              >
                                                Save
                                              </button>
                                              <button
                                                onClick={() => setEditingPts((prev) => { const n = { ...prev }; delete n[s.id]; return n; })}
                                                className="text-[10px] font-mono text-[#aaa] bg-[#1a1a1a] px-2 py-1 rounded-lg hover:text-[#e0e0e0]"
                                              >
                                                ✕
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              {s.status === "pending" && (
                                                <>
                                                  <button
                                                    onClick={() => approveWeeklySubmission(s)}
                                                    className="text-[10px] font-mono text-[#00e87a] bg-[#00e87a15] px-2 py-1 rounded-lg hover:bg-[#00e87a25]"
                                                  >
                                                    ✓
                                                  </button>
                                                  <button
                                                    onClick={() => rejectWeeklySubmission(s)}
                                                    className="text-[10px] font-mono text-[#ff4d4d] bg-[#ff4d4d15] px-2 py-1 rounded-lg hover:bg-[#ff4d4d25]"
                                                  >
                                                    ✗
                                                  </button>
                                                </>
                                              )}
                                              <button
                                                onClick={() => setEditingPts((prev) => ({ ...prev, [s.id]: String(s.points_awarded) }))}
                                                className="text-[10px] font-mono text-[#a78bfa] bg-[#a78bfa15] px-2 py-1 rounded-lg hover:bg-[#a78bfa25]"
                                              >
                                                pts
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
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

// ════════════════════════════════════════════════════════════
// SubscriberAdminSection
// ════════════════════════════════════════════════════════════

function AnnouncementAdminSection() {
  const db = getSupabaseClient();
  const [text, setText] = useState("");
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const { data } = await (db.from("app_config") as any)
        .select("*")
        .in("key", ["announcement_text", "announcement_active"]);
      for (const c of data || []) {
        if (c.key === "announcement_text") setText(c.value || "");
        if (c.key === "announcement_active") setActive(c.value === "true");
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save(nextActive?: boolean) {
    setSaving(true);
    try {
      await Promise.all([
        (db.from("app_config") as any).upsert({ key: "announcement_text", value: text }),
        (db.from("app_config") as any).upsert({
          key: "announcement_active",
          value: String(nextActive ?? active),
        }),
      ]);
      showToast("✓ Announcement saved");
    } catch {
      showToast("Save failed");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up max-w-2xl">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-[#111] border border-[#00e87a30] text-[#00e87a]
          font-mono text-xs px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h2 className="font-display font-bold text-lg text-[#e2e2e2] mb-1">📣 Announcement Banner</h2>
        <p className="text-[#777] text-xs font-mono">
          Shown as a banner at the top of the homepage when active.
        </p>
      </div>

      <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl p-5 space-y-4">
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-[#666] mb-2">
            Message
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="e.g. 🎉 New weekly challenge is live — solve by Sunday!"
            className="w-full bg-[#080808] border border-[#1a1a1a] rounded-xl px-3 py-2.5
              text-sm font-mono text-[#e0e0e0] placeholder-[#333]
              focus:outline-none focus:border-[#00e87a25] transition-colors resize-none"
          />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4 accent-[#00e87a]"
          />
          <span className="text-xs font-mono text-[#bbb]">Show banner on homepage</span>
        </label>

        <button
          onClick={() => save()}
          disabled={saving || !text.trim()}
          className="px-4 py-2 rounded-xl font-mono text-xs font-bold bg-[#00e87a] text-black
            hover:bg-[#00ff88] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save Announcement"}
        </button>
      </div>

      {active && text.trim() && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-[#666] mb-2">Preview</p>
          <div className="px-4 py-3 bg-[#00e87a08] border border-[#00e87a20] rounded-2xl
            flex items-center gap-2 text-sm font-mono text-[#00e87a]">
            <span>📣</span>
            <span>{text}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// FeedbackAdminSection — read-only view of post-contest feedback
// ════════════════════════════════════════════════════════════

function FeedbackAdminSection() {
  const db = getSupabaseClient();

  const [feedback, setFeedback] = useState<ContestFeedback[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [contestFilter, setContestFilter] = useState<string>("all");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (db.from("contest_feedback") as any)
        .select("*")
        .order("created_at", { ascending: false });
      setFeedback((data || []) as ContestFeedback[]);
    } catch {}
    setLoading(false);
  }

  const contestNames = Array.from(new Set(feedback.map((f) => f.contest_name))).sort();
  const visible = contestFilter === "all" ? feedback : feedback.filter((f) => f.contest_name === contestFilter);

  const rated = feedback.filter((f) => f.rating);
  const avgRating = rated.length
    ? (rated.reduce((sum, f) => sum + (f.rating || 0), 0) / rated.length).toFixed(1)
    : "—";
  const recommendYes = feedback.filter((f) => f.would_recommend === true).length;
  const recommendNo  = feedback.filter((f) => f.would_recommend === false).length;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <h2 className="font-display font-bold text-xl">Contest Feedback</h2>
        {contestNames.length > 0 && (
          <select
            value={contestFilter}
            onChange={(e) => setContestFilter(e.target.value)}
            className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl px-3 py-2 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
          >
            <option value="all">All contests</option>
            {contestNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-4 text-center">
          <div className="text-2xl font-display font-bold text-[#f0b429]">{avgRating}{rated.length ? " ★" : ""}</div>
          <div className="text-[10px] font-mono text-[#555] mt-1">Avg Rating ({rated.length})</div>
        </div>
        <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-4 text-center">
          <div className="text-2xl font-display font-bold text-[#00e87a]">{recommendYes}</div>
          <div className="text-[10px] font-mono text-[#555] mt-1">Would Recommend</div>
        </div>
        <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-4 text-center">
          <div className="text-2xl font-display font-bold text-[#ff4d4d]">{recommendNo}</div>
          <div className="text-[10px] font-mono text-[#555] mt-1">Would Not</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#555] font-mono text-xs py-6">
          <div className="spinner" /> Loading…
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-[#555] font-mono text-sm">No feedback submitted yet</div>
      ) : (
        <div className="space-y-3">
          {visible.map((f) => (
            <div key={f.id} className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div>
                  <div className="font-mono font-bold text-[#e0e0e0] text-sm">
                    {f.name} <span className="text-[#999]">@{f.github}</span>
                  </div>
                  <div className="text-[10px] font-mono text-[#666] mt-0.5">
                    {f.contest_name} ·{" "}
                    <span className={f.outcome === "disqualified" ? "text-[#ff4d4d]" : "text-[#00e87a]"}>
                      {f.outcome === "disqualified" ? "Disqualified" : "Submitted"}
                    </span>{" "}
                    · {new Date(f.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {f.rating != null && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg border text-[#f0b429] bg-[#f0b42910] border-[#f0b42920]">
                      {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                    </span>
                  )}
                  {f.difficulty && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg border text-[#a78bfa] bg-[#a78bfa10] border-[#a78bfa20] capitalize">
                      {f.difficulty === "right" ? "Just right" : f.difficulty}
                    </span>
                  )}
                  {f.would_recommend != null && (
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${f.would_recommend ? "text-[#00e87a] bg-[#00e87a10] border-[#00e87a20]" : "text-[#ff4d4d] bg-[#ff4d4d10] border-[#ff4d4d20]"}`}>
                      {f.would_recommend ? "👍 Recommend" : "👎 Not really"}
                    </span>
                  )}
                </div>
              </div>
              {f.comments && (
                <p className="text-xs font-mono text-[#bbb] mt-2 whitespace-pre-wrap leading-relaxed border-t border-[#141414] pt-2">
                  {f.comments}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubscriberAdminSection() {
  const db = getSupabaseClient();

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [toast,       setToast]       = useState("");
  const [fee,         setFee]         = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: null, id: "", github: "" });
  const modalResolve = useRef<((v: string | null) => void) | null>(null);

  function openModal(m: Omit<ModalState, "type"> & { type: NonNullable<ModalState["type"]> }): Promise<string | null> {
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
    modalResolve.current?.(null);
    modalResolve.current = null;
    setModal({ type: null, id: "", github: "" });
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [{ data: subs }, { data: configs }] = await Promise.all([
        (db.from("subscribers") as any).select("*").order("created_at", { ascending: false }),
        (db.from("app_config") as any).select("*").in("key", ["subscription_fee"]),
      ]);
      setSubscribers((subs || []) as Subscriber[]);
      for (const c of configs || []) {
        if (c.key === "subscription_fee") setFee(c.value);
      }
    } catch {}
    setLoading(false);
  }

  // Subscriptions are confirmed automatically the moment a Razorpay
  // payment is verified (see /api/razorpay/verify) — there is no
  // manual approval step anymore. This lets an admin revoke access
  // in edge cases (refund, chargeback, abuse), which is the only
  // status change still needed here.
  async function revokeAccess(sub: Subscriber) {
    const reason = await openModal({ type: "reject-reg", id: sub.id, github: sub.github });
    if (reason === null) return;
    await (db.from("subscribers") as any).update({ status: "rejected" }).eq("id", sub.id);
    showToast(`Access revoked for @${sub.github}`);
    load();
  }

  async function saveConfig() {
    if (!fee) return;
    setSavingConfig(true);
    try {
      await (db.from("app_config") as any).upsert({ key: "subscription_fee", value: fee });
      showToast("✓ Config saved");
    } catch { showToast("Save failed"); }
    setSavingConfig(false);
  }

  const confirmed = subscribers.filter(s => s.status === "confirmed");
  const revoked   = subscribers.filter(s => s.status === "rejected");

  return (
    <div className="space-y-6 animate-fade-up">
      {modal.type && <ActionModal modal={modal} onConfirm={closeModal} onCancel={cancelModal} />}
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-[#00e87a] text-black px-4 py-2.5 rounded-lg font-mono text-sm shadow-xl">
          {toast}
        </div>
      )}

      {/* Config editor */}
      <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-5">
        <h3 className="font-mono font-bold text-[#e0e0e0] text-sm mb-4">⚙️ Subscription Settings</h3>
        <div className="mb-4 max-w-xs">
          <label className="block text-[10px] text-[#666] font-mono uppercase tracking-wider mb-1.5">
            One-time Fee (₹)
          </label>
          <input
            type="number"
            value={fee}
            onChange={e => setFee(e.target.value)}
            placeholder="e.g. 499"
            className="w-full bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl px-3 py-2 text-sm font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00e87a40]"
          />
        </div>
        <button
          onClick={saveConfig}
          disabled={savingConfig}
          className="px-4 py-2 bg-[#00e87a] text-black font-mono text-xs font-bold rounded-xl hover:bg-[#00ff88] disabled:opacity-50 transition-all"
        >
          {savingConfig ? "Saving…" : "Save Settings"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Active Subscribers", value: confirmed.length, color: "text-[#00e87a]" },
          { label: "Revoked",            value: revoked.length,   color: "text-[#ff4d4d]" },
        ].map(s => (
          <div key={s.label} className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-4 text-center">
            <div className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] font-mono text-[#555] mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Subscriber list */}
      {loading ? (
        <div className="flex items-center gap-2 text-[#555] font-mono text-xs py-6">
          <div className="spinner" /> Loading…
        </div>
      ) : subscribers.length === 0 ? (
        <div className="text-center py-12 text-[#555] font-mono text-sm">No subscribers yet</div>
      ) : (
        <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[2rem_1fr_1fr_8rem_7rem_6rem] gap-3 px-4 py-2.5
            border-b border-[#161616] text-[10px] text-[#555] font-mono uppercase tracking-widest">
            <div />
            <div>User</div>
            <div>Payment ID</div>
            <div>Status</div>
            <div>Date</div>
            <div className="text-center">Actions</div>
          </div>

          {subscribers.map(sub => {
            const statusColor =
              sub.status === "confirmed" ? "text-[#00e87a] bg-[#00e87a10] border-[#00e87a20]" :
                                           "text-[#ff4d4d] bg-[#ff4d4d10] border-[#ff4d4d20]";
            return (
              <div key={sub.id}
                className="grid grid-cols-1 sm:grid-cols-[2rem_1fr_1fr_8rem_7rem_6rem] gap-3 items-center
                  px-4 py-3 border-b border-[#141414] last:border-0 hover:bg-[#0d0d0d] transition-colors">
                <img
                  src={`https://github.com/${sub.github}.png?size=28`}
                  className="w-7 h-7 rounded-full ring-1 ring-[#2a2a2a] hidden sm:block"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="min-w-0">
                  <div className="text-xs font-mono font-bold text-[#e0e0e0] truncate">{sub.name}</div>
                  <div className="text-[10px] font-mono text-[#555]">@{sub.github}</div>
                </div>
                <div className="text-xs font-mono text-[#777] truncate">{sub.razorpay_payment_id || sub.txn_id}</div>
                <div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${statusColor}`}>
                    {sub.status === "confirmed" ? "✓ Active" : "✗ Revoked"}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-[#555]">
                  {new Date(sub.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                </div>
                <div className="flex items-center gap-2 justify-center">
                  {sub.status === "confirmed" && (
                    <button
                      onClick={() => revokeAccess(sub)}
                      className="text-[10px] font-mono text-[#ff4d4d] bg-[#ff4d4d10] border border-[#ff4d4d20] px-2 py-1 rounded-lg hover:bg-[#ff4d4d18] transition-all"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// ════════════════════════════════════════════════════════════
// AiGenerateSection — AI Problem Generator for Admin
// ════════════════════════════════════════════════════════════

function AiGenerateSection() {
  const db = getSupabaseClient();
  const [concept,    setConcept]    = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated,  setGenerated]  = useState<any>(null);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [err,        setErr]        = useState("");
  const [toast,      setToast]      = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleGenerate() {
    if (!concept.trim()) return;
    setGenerating(true);
    setGenerated(null);
    setSaved(false);
    setErr("");
    try {
      const { generateFullProblem } = await import("@/lib/gemini");
      const result = await generateFullProblem(concept.trim());
      if (!result) {
        setErr("AI couldn't generate a problem. Try rephrasing your concept.");
      } else {
        setGenerated(result);
      }
    } catch {
      setErr("Generation failed. Try again.");
    }
    setGenerating(false);
  }

  async function handleSaveProblem() {
    if (!generated) return;
    setSaving(true);
    try {
      const { error } = await (db.from("problems") as any).insert({
        title:         generated.title,
        description:   generated.description,
        difficulty:    generated.difficulty,
        points:        generated.points,
        tags:          generated.tags || [],
        example:       generated.example || "",
        param_types:   generated.param_types || [],
        return_type:   generated.return_type || "bool",
        hints:         generated.hints || [],
        test_cases:    generated.test_cases || [],
        starter_code:  "",
        submission_count: 0,
        visibility:    "public",
      });
      if (error) throw error;
      setSaved(true);
      showToast("✓ Problem saved! Find it in the Problems section.");
    } catch (e: any) {
      setErr(e.message || "Save failed");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-[#00e87a] text-black px-4 py-2.5 rounded-lg font-mono text-sm shadow-xl">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">✦</span>
          <div>
            <h3 className="font-mono font-bold text-[#e0e0e0] text-sm">AI Problem Generator</h3>
            <p className="text-[10px] font-mono text-[#555]">
              Describe a concept → AI generates a complete problem with test cases, hints, and starter code
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={concept}
            onChange={e => setConcept(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleGenerate()}
            placeholder="e.g. two sum using hashmap, binary search on rotated array, valid parentheses with stack…"
            className="flex-1 bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl px-3.5 py-2.5 text-sm font-mono
              text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a30] transition-colors"
          />
          <button
            onClick={handleGenerate}
            disabled={generating || !concept.trim()}
            className="px-4 py-2.5 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl
              hover:bg-[#00ff88] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shrink-0"
          >
            {generating
              ? <><span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />Generating…</>
              : "✦ Generate"}
          </button>
        </div>

        {err && <p className="text-[10px] text-[#ff4d4d] font-mono mt-2">{err}</p>}
      </div>

      {/* Generated problem preview */}
      {generated && (
        <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl overflow-hidden">
          {/* Preview header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#161616] bg-[#0d0d0d]">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#e0e0e0]">{generated.title}</span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg
                ${generated.difficulty === "Easy"   ? "text-[#00e87a] bg-[#00e87a12]" :
                  generated.difficulty === "Medium" ? "text-[#f0b429] bg-[#f0b42912]" :
                                                      "text-[#ff4d4d] bg-[#ff4d4d12]"}`}>
                {generated.difficulty}
              </span>
              <span className="text-[10px] font-mono text-[#a78bfa]">{generated.points} pts</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-[10px] font-mono px-3 py-1.5 bg-[#141414] border border-[#1f1f1f] text-[#777] rounded-lg hover:text-[#ccc] transition-all"
              >
                ↻ Regenerate
              </button>
              {!saved ? (
                <button
                  onClick={handleSaveProblem}
                  disabled={saving}
                  className="text-[10px] font-mono px-3 py-1.5 bg-[#00e87a] text-black font-bold rounded-lg hover:bg-[#00ff88] disabled:opacity-50 transition-all"
                >
                  {saving ? "Saving…" : "✓ Save Problem"}
                </button>
              ) : (
                <span className="text-[10px] font-mono px-3 py-1.5 bg-[#00e87a12] text-[#00e87a] border border-[#00e87a20] rounded-lg">
                  ✓ Saved
                </span>
              )}
            </div>
          </div>

          {/* Preview body */}
          <div className="p-5 space-y-4">
            {/* Tags */}
            {(generated.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {generated.tags.map((tag: string) => (
                  <span key={tag} className="px-2 py-0.5 bg-[#141414] text-[#777] text-[10px] font-mono rounded border border-[#1c1c1c]">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Description preview */}
            <div>
              <div className="text-[10px] font-mono text-[#555] uppercase tracking-widest mb-2">Description</div>
              <div className="text-xs font-mono text-[#bbb] leading-relaxed bg-[#060606] rounded-xl p-3 border border-[#141414]"
                dangerouslySetInnerHTML={{ __html: generated.description || "" }} />
            </div>

            {/* Example */}
            {generated.example && (
              <div>
                <div className="text-[10px] font-mono text-[#555] uppercase tracking-widest mb-2">Example</div>
                <pre className="text-xs font-mono text-[#00e87a] bg-[#060606] rounded-xl p-3 border border-[#141414] whitespace-pre-wrap">
                  {generated.example}
                </pre>
              </div>
            )}

            {/* Test cases */}
            {(generated.test_cases || []).length > 0 && (
              <div>
                <div className="text-[10px] font-mono text-[#555] uppercase tracking-widest mb-2">
                  Test Cases ({generated.test_cases.length})
                </div>
                <div className="space-y-1.5">
                  {generated.test_cases.map((tc: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] font-mono bg-[#060606] rounded-lg px-3 py-2 border border-[#141414]">
                      <span className="text-[#555]">#{i + 1}</span>
                      <span className="text-[#777]">input:</span>
                      <code className="text-[#ccc] flex-1">{tc.input}</code>
                      <span className="text-[#555]">→</span>
                      <code className="text-[#00e87a]">{tc.expected}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hints */}
            {(generated.hints || []).filter(Boolean).length > 0 && (
              <div>
                <div className="text-[10px] font-mono text-[#555] uppercase tracking-widest mb-2">Hints</div>
                <div className="space-y-1.5">
                  {generated.hints.filter(Boolean).map((hint: string, i: number) => (
                    <div key={i} className="flex gap-2 text-[10px] font-mono bg-[#060606] rounded-lg px-3 py-2 border border-[#141414]">
                      <span className="text-[#f0b429] shrink-0">#{i + 1}</span>
                      <span className="text-[#bbb]">{hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-[#444] font-mono">
              ⚠ Review AI-generated content before saving. Test cases may need manual verification.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}