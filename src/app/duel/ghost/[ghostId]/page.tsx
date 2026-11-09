"use client";
import { extractVerifiedGithubIdentity } from '@/lib/authIdentity';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import { getGhostRunByIdAction } from "@/app/actions/ghosts";
import type { GhostRun } from "@/types/ghost";
import type { Problem } from "@/types/database";
import GhostDuelArena from "@/components/duels/GhostDuelArena";

interface PageProps {
  params: { ghostId: string } | Promise<{ ghostId: string }>;
}

export default function GhostDuelPage({ params }: PageProps) {
  const [ghostId, setGhostId] = useState<string>(() => {
    if (params && typeof (params as any).then !== "function") {
      return (params as { ghostId: string }).ghostId || "";
    }
    return "";
  });

  useEffect(() => {
    if (params && typeof (params as any).then === "function") {
      Promise.resolve(params).then((p) => {
        if (p?.ghostId) setGhostId(p.ghostId);
      });
    }
  }, [params]);

  const router = useRouter();

  const [ghost, setGhost] = useState<GhostRun | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    github: string;
    name: string;
    avatar?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const db = getSupabaseClient();

      // 1. Get authenticated user
      try {
        const { data: { session } } = await db.auth.getSession();
        if (session?.user) {
          const verified = extractVerifiedGithubIdentity(session.user);
          if (verified) {
            setCurrentUser({
              github: verified.github,
              name: verified.name,
              avatar: verified.avatar_url || undefined,
            });
          }
        }
      } catch (err) {
        console.warn("Auth check error in ghost duel:", err);
      }

      // 2. Load Ghost
      try {
        const ghostRecord = await getGhostRunByIdAction(ghostId);
        if (!ghostRecord) {
          setErrorMsg("Ghost record not found.");
          setLoading(false);
          return;
        }
        setGhost(ghostRecord);

        // 3. Load Problem
        const { data: probData, error: probErr } = await db
          .from("problems")
          .select("*")
          .or(`id.eq.${ghostRecord.problem_id},slug.eq.${ghostRecord.problem_id},title.ilike.%${ghostRecord.problem_title}%`)
          .maybeSingle();

        if (probData && !probErr) {
          setProblem(probData as unknown as Problem);
        } else {
          // Fallback dummy problem definition if database doesn't have it locally
          setProblem({
            id: ghostRecord.problem_id,
            slug: ghostRecord.problem_id,
            title: ghostRecord.problem_title,
            description: `Race against @${ghostRecord.github}'s ghost!\n\nGiven the input parameters, write an algorithm that produces the correct answer under target time.`,
            difficulty: "medium",
            points: 150,
            constraints: ["Time Limit: 2.0s", "Memory Limit: 256MB"],
            test_cases: [
              { input: "[2, 7, 11, 15], 9", expected: "[0, 1]" },
              { input: "[3, 2, 4], 6", expected: "[1, 2]" },
              { input: "[3, 3], 6", expected: "[0, 1]" },
            ],
            starter_code: {
              python: "class Solution:\n    def solve(self, *args):\n        pass\n",
              javascript: "function solve(...args) {\n    return [];\n}\n",
              cpp: "class Solution {\npublic:\n    vector<int> solve() {\n        return {};\n    }\n};",
            },
          } as unknown as Problem);
        }
      } catch (err: any) {
        console.error("Error loading ghost duel:", err);
        setErrorMsg(err.message || "Failed to load ghost match.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [ghostId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <div className="font-mono text-xs text-slate-400">
          Summoning Ghost Runner & Preparing Arena…
        </div>
      </div>
    );
  }

  if (errorMsg || !ghost || !problem) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md text-center space-y-4">
          <div className="text-3xl">👻</div>
          <h1 className="text-base font-bold font-mono text-white">Ghost Match Unavailable</h1>
          <p className="text-xs font-mono text-slate-400">
            {errorMsg || "The requested ghost run could not be loaded."}
          </p>
          <button
            onClick={() => router.push("/duels")}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition"
          >
            Return to Duels Lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <GhostDuelArena
      ghost={ghost}
      problem={problem}
      currentUser={currentUser}
      onExit={() => router.push("/duels")}
    />
  );
}

