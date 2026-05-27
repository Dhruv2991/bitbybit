'use client';
// ════════════════════════════════════════════════════════════
// src/components/pages/ProblemsPage.tsx
// Problem list + workspace (with Monaco editor)
// ════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { getSupabaseClient } from '@/lib/supabase';
import type { Problem, User } from '@/types/database';

const Workspace = dynamic(() => import('@/app/problems/Workspace'), { ssr: false });

const STATIC_PROBLEMS: Problem[] = [
  { id:'static-1', title:'Two Sum', difficulty:'Easy', points:100, tags:['Arrays','Hash Table'],
    description:'<p>Given an array of integers <code>nums</code> and an integer <code>target</code>, return indices of the two numbers such that they add up to <code>target</code>.</p>',
    example:'Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]',
    starter_code:'def twoSum(nums, target):\n    pass',
    submission_count:14, created_at:'', updated_at:'',
    test_cases:[{input:'[2,7,11,15], 9',expected:'[0, 1]'},{input:'[3,2,4], 6',expected:'[1, 2]'}] },
  { id:'static-2', title:'Valid Palindrome', difficulty:'Easy', points:100, tags:['Strings'],
    description:'<p>Given a string <code>s</code>, return <code>true</code> if it is a palindrome, or <code>false</code> otherwise.</p>',
    example:'Input: s = "A man, a plan, a canal: Panama"\nOutput: true',
    starter_code:'def isPalindrome(s):\n    pass',
    submission_count:8, created_at:'', updated_at:'', test_cases:[] },
  { id:'static-3', title:'Container With Most Water', difficulty:'Medium', points:200, tags:['Arrays','Two Pointers'],
    description:'<p>Find two lines that together with the x-axis forms a container such that it contains the most water.</p>',
    example:'Input: height = [1,8,6,2,5,4,8,3,7]\nOutput: 49',
    starter_code:'def maxArea(height):\n    pass',
    submission_count:5, created_at:'', updated_at:'', test_cases:[] },
  { id:'static-4', title:'Longest Palindromic Substring', difficulty:'Medium', points:200, tags:['Strings','DP'],
    description:'<p>Given a string <code>s</code>, return the longest palindromic substring in <code>s</code>.</p>',
    example:'Input: s = "babad"\nOutput: "bab"',
    starter_code:'def longestPalindrome(s):\n    pass',
    submission_count:3, created_at:'', updated_at:'', test_cases:[] },
  { id:'static-5', title:'Edit Distance', difficulty:'Hard', points:300, tags:['DP','Strings'],
    description:'<p>Given two strings <code>word1</code> and <code>word2</code>, return the minimum number of operations to convert word1 to word2.</p>',
    example:'Input: word1 = "horse", word2 = "ros"\nOutput: 3',
    starter_code:'def minDistance(word1, word2):\n    pass',
    submission_count:0, created_at:'', updated_at:'', test_cases:[] },
  { id:'static-6', title:'Binary Tree Level Order', difficulty:'Medium', points:200, tags:['Trees','BFS'],
    description:"<p>Given the <code>root</code> of a binary tree, return the level order traversal of its nodes' values.</p>",
    example:'Input: root = [3,9,20,null,null,15,7]\nOutput: [[3],[9,20],[15,7]]',
    starter_code:'def levelOrder(root):\n    pass',
    submission_count:0, created_at:'', updated_at:'', test_cases:[] },
];

const DIFFICULTIES = ['all', 'Easy', 'Medium', 'Hard'] as const;

interface ProblemsPageProps { user: User | null }

export default function ProblemsPage({ user }: ProblemsPageProps) {
  const db = getSupabaseClient();
  const [problems,  setProblems]  = useState<Problem[]>([]);
  const [filter,    setFilter]    = useState<string>('all');
  const [selected,  setSelected]  = useState<Problem | null>(null);
  const [solved,    setSolved]    = useState<string[]>([]);

  useEffect(() => {
    const s = JSON.parse(localStorage.getItem('bb_solved') || '[]');
    setSolved(s);

    // ── Initial fetch ─────────────────────────────────────
    (async () => {
      try {
        const { data } = await db.from('problems').select('*').order('created_at', { ascending: false });
        setProblems([...(data || []), ...STATIC_PROBLEMS]);
      } catch {
        setProblems(STATIC_PROBLEMS);
      }
    })();

    // ── Realtime: admin adds / edits / deletes a problem ──
    // Users see the new problem list immediately without refreshing.
    const channel = db
      .channel('problems-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'problems' },
        async () => {
          try {
            const { data } = await db
              .from('problems')
              .select('*')
              .order('created_at', { ascending: false });
            setProblems([...(data || []), ...STATIC_PROBLEMS]);
          } catch {
            // keep existing list on network error
          }
        },
      )
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, []);

  const filtered = filter === 'all'
    ? problems
    : problems.filter(p => p.difficulty === filter || (p.tags || []).includes(filter));

  if (selected) {
    return (
      <Workspace
        problem={selected}
        user={user}
        onClose={() => setSelected(null)}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-2xl">Problems</h1>
        <div className="flex gap-2 flex-wrap">
          {DIFFICULTIES.map(d => (
            <button
              key={d}
              onClick={() => setFilter(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-all
                ${filter === d
                  ? 'bg-[#00e87a] text-black font-bold'
                  : 'bg-[#111] border border-[#1f1f1f] text-[#666] hover:text-[#e0e0e0]'}`}
            >
              {d === 'all' ? 'All' : d}
            </button>
          ))}
        </div>
      </div>

      {/* Problem list */}
      <div className="bg-[#111] border border-[#1f1f1f] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2rem_1fr_auto_auto_auto_auto] gap-4 px-5 py-3
          border-b border-[#1a1a1a] text-xs text-[#444] font-mono uppercase tracking-wider">
          <div>#</div>
          <div>Title</div>
          <div>Difficulty</div>
          <div>Points</div>
          <div>Submissions</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[#444] font-mono">No problems match this filter.</div>
        ) : (
          filtered.map((p, i) => {
            const isSolved = solved.includes(p.id);
            return (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                className="grid grid-cols-[2rem_1fr_auto_auto_auto_auto] gap-4 px-5 py-4
                  border-b border-[#161616] last:border-0 hover:bg-[#161616] cursor-pointer
                  transition-colors group items-center"
              >
                <div className="text-[#444] text-sm font-mono">{i + 1}</div>
                <div>
                  <div className="text-[#e0e0e0] font-mono text-sm group-hover:text-[#00e87a] transition-colors">
                    {p.title}
                  </div>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {(p.tags || []).map(t => (
                      <span key={t} className="text-[10px] text-[#444] bg-[#0f0f0f] px-1.5 py-0.5 rounded font-mono">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded
                    ${p.difficulty === 'Easy'   ? 'text-[#00e87a] bg-[#00e87a15]' :
                      p.difficulty === 'Medium' ? 'text-[#f0b429] bg-[#f0b42915]' :
                                                  'text-[#ff4d4d] bg-[#ff4d4d15]'}`}>
                    {p.difficulty}
                  </span>
                </div>
                <div className="text-[#a78bfa] text-sm font-mono font-bold">{p.points}</div>
                <div className="text-[#444] text-sm font-mono">{p.submission_count || 0}</div>
                <div>
                  {isSolved
                    ? <span className="text-[#00e87a] text-xs font-mono font-bold">✓ Solved</span>
                    : <span className="text-[#333] text-xs font-mono">Solve →</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}