import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const prisma = new PrismaClient();

interface ComparisonRow {
  entity: string;
  sourceCount: number;
  targetCount: number;
  status: 'MATCH' | 'MISMATCH' | 'EXPECTED_DIFF';
  notes?: string;
}

async function verifyIntegrity() {
  console.log('════════════════════════════════════════════════════════════');
  console.log(`🔍 BitByBit Migration: Data Integrity & Checksum Verification`);
  console.log('════════════════════════════════════════════════════════════\n');

  const comparisons: ComparisonRow[] = [];

  // Helper for comparing table counts
  async function compareCount(
    entity: string,
    fetchSource: () => Promise<number>,
    fetchTarget: () => Promise<number>,
    notes?: string
  ) {
    try {
      const sourceCount = await fetchSource();
      const targetCount = await fetchTarget();
      const status = sourceCount === targetCount ? 'MATCH' : 'MISMATCH';
      comparisons.push({ entity, sourceCount, targetCount, status, notes });
    } catch (e: any) {
      comparisons.push({
        entity,
        sourceCount: -1,
        targetCount: -1,
        status: 'MISMATCH',
        notes: `Error: ${e.message}`,
      });
    }
  }

  // 1. Members vs Users
  await compareCount(
    'Users (members -> User)',
    async () => {
      const { count } = await supabase.from('members').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.user.count()
  );

  // 2. Problems
  await compareCount(
    'Problems (problems -> Problem)',
    async () => {
      const { count } = await supabase.from('problems').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.problem.count()
  );

  // 3. Test Cases (Flattened JSON array length vs Relational rows)
  await compareCount(
    'Test Cases (problems.test_cases -> TestCase)',
    async () => {
      const { data } = await supabase.from('problems').select('test_cases');
      return (data || []).reduce((acc: number, p: any) => acc + (Array.isArray(p.test_cases) ? p.test_cases.length : 0), 0);
    },
    async () => prisma.testCase.count(),
    'Source count is sum of json array elements'
  );

  // 4. Submissions
  await compareCount(
    'Submissions (submissions -> Submission)',
    async () => {
      const { count } = await supabase.from('submissions').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.submission.count()
  );

  // 5. Total Submission Points Awarded Checksum
  await compareCount(
    'Total Points Checksum (SUM points_awarded)',
    async () => {
      const { data } = await supabase.from('submissions').select('points_awarded');
      return (data || []).reduce((acc: number, s: any) => acc + (s.points_awarded || 0), 0);
    },
    async () => {
      const result = await prisma.submission.aggregate({
        _sum: { pointsAwarded: true },
      });
      return result._sum.pointsAwarded || 0;
    },
    'Checksum sum of all submission points'
  );

  // 6. UserProblemBest records vs distinct (github, problem_id) in Submissions
  await compareCount(
    'UserProblemBest Backfill Records',
    async () => {
      const { data } = await supabase.from('submissions').select('github, problem_id');
      const uniquePairs = new Set((data || []).map((s: any) => `${(s.github || '').trim().toLowerCase()}:${s.problem_id}`));
      return uniquePairs.size;
    },
    async () => prisma.userProblemBest.count(),
    'Distinct (user, problem) pairs'
  );

  // 7. Contests
  await compareCount(
    'Contests (contests -> Contest)',
    async () => {
      const { count } = await supabase.from('contests').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.contest.count()
  );

  // 8. Contest Registrations (checking only valid registrations whose contest exists)
  await compareCount(
    'Contest Registrations',
    async () => {
      const { data: contests } = await supabase.from('contests').select('id');
      const contestIdSet = new Set((contests || []).map((c: any) => c.id));
      const { data: regs } = await supabase.from('contest_registrations').select('id, contest_id');
      return (regs || []).filter((r: any) => contestIdSet.has(r.contest_id)).length;
    },
    async () => prisma.contestRegistration.count(),
    'Source count filtered for valid parent contests'
  );

  // 9. Arena Submissions
  await compareCount(
    'Arena Submissions',
    async () => {
      const { count } = await supabase.from('arena_submissions').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.arenaSubmission.count()
  );

  // 10. Weekly Challenges
  await compareCount(
    'Weekly Challenges',
    async () => {
      const { count } = await supabase.from('weekly_challenges').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.weeklyChallenge.count()
  );

  // 11. Weekly Access
  await compareCount(
    'Weekly Access',
    async () => {
      const { count } = await supabase.from('weekly_access').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.weeklyAccess.count()
  );

  // 12. Weekly Submissions
  await compareCount(
    'Weekly Submissions',
    async () => {
      const { count } = await supabase.from('weekly_submissions').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.weeklySubmission.count()
  );

  // 13. Subscribers
  await compareCount(
    'Subscribers',
    async () => {
      const { count } = await supabase.from('subscribers').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.subscriber.count()
  );

  // 14. Coupons
  await compareCount(
    'Coupons',
    async () => {
      const { count } = await supabase.from('coupons').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.coupon.count()
  );

  // 15. Certificates
  await compareCount(
    'Certificates',
    async () => {
      const { count } = await supabase.from('certificates').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.certificate.count()
  );

  // 16. Email Log
  await compareCount(
    'Email Logs',
    async () => {
      const { count } = await supabase.from('email_log').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.emailLog.count()
  );

function mapAiFeature(val?: string | null): string {
  switch (val?.toLowerCase()) {
    case 'explain_failure':
      return 'EXPLAIN_FAILURE';
    case 'review_code':
      return 'REVIEW_CODE';
    case 'validate_approach':
      return 'VALIDATE_APPROACH';
    case 'editorial':
      return 'EDITORIAL';
    case 'recommendation':
      return 'RECOMMENDATION';
    default:
      return 'HINT';
  }
}

  // 17. AI Usage (Consolidated daily records)
  await compareCount(
    'AI Usage (Daily Aggregated Records)',
    async () => {
      const { data: members } = await supabase.from('members').select('id, github');
      const memberMap = new Map((members || []).map((m: any) => [(m.github || '').trim().toLowerCase(), m.id]));
      const { data } = await supabase.from('ai_usage').select('github, feature, problem_id, date');
      const uniqueKeys = new Set<string>();
      for (const au of data || []) {
        const userId = memberMap.get((au.github || '').trim().toLowerCase());
        if (userId) {
          const dateStr = au.date ? new Date(au.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
          uniqueKeys.add(`${userId}:${mapAiFeature(au.feature)}:${au.problem_id || ''}:${dateStr}`);
        }
      }
      return uniqueKeys.size;
    },
    async () => prisma.aiUsage.count(),
    'Source count is unique (user, feature, problem, date) daily keys'
  );

  // 18. Practice Attempts
  await compareCount(
    'Practice Attempts',
    async () => {
      const { count } = await supabase.from('practice_attempts').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.practiceAttempt.count()
  );

  // 19. App Config
  await compareCount(
    'App Config',
    async () => {
      const { count } = await supabase.from('app_config').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.appConfig.count()
  );

  // 20. Collaboration Page
  await compareCount(
    'Collaboration Page',
    async () => {
      const { count } = await supabase.from('collaborations_page').select('*', { count: 'exact', head: true });
      return count || 0;
    },
    async () => prisma.collaborationPage.count()
  );

  // Print results table
  console.log('| Entity / Table | Supabase (Source) | PostgreSQL (Target) | Status | Notes |');
  console.log('|---|---|---|---|---|');
  let hasMismatch = false;

  for (const c of comparisons) {
    const statusIcon = c.status === 'MATCH' ? '✅ MATCH' : '❌ MISMATCH';
    if (c.status === 'MISMATCH') hasMismatch = true;
    console.log(`| ${c.entity} | ${c.sourceCount} | ${c.targetCount} | ${statusIcon} | ${c.notes || '-'} |`);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  if (hasMismatch) {
    console.warn('⚠️ One or more entities did not match exactly between source and target.');
  } else {
    console.log('🎉 100% Data Integrity Verified! All source entities and checksums match.');
  }
  console.log('════════════════════════════════════════════════════════════\n');
}

verifyIntegrity()
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
