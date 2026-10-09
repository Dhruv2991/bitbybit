import { createClient } from '@supabase/supabase-js';
import {
  PrismaClient,
  UserRole,
  Difficulty,
  ProblemVisibility,
  SubmissionStatus,
  ContestStatus,
  RegistrationStatus,
  ArenaStatus,
  SubscriberStatus,
  DiscountType,
  CertificateStatus,
  EmailDeliveryStatus,
  AiFeature,
} from '@prisma/client';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const isDryRun = process.argv.includes('--dry-run');
const isFinalCutover = process.argv.includes('--final-cutover');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const githubToken = process.env.GITHUB_TOKEN;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const prisma = new PrismaClient();

// In-memory cache for GitHub API lookups
const githubUserCache = new Map<string, { id: string | null; avatarUrl: string | null }>();

async function fetchGitHubUser(username: string): Promise<{ id: string | null; avatarUrl: string | null }> {
  if (!username) return { id: null, avatarUrl: null };
  const cleanUsername = username.trim().toLowerCase();
  if (githubUserCache.has(cleanUsername)) {
    return githubUserCache.get(cleanUsername)!;
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'BitByBit-Migration-Tool',
      Accept: 'application/vnd.github.v3+json',
    };
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const response = await axios.get(`https://api.github.com/users/${encodeURIComponent(cleanUsername)}`, {
      headers,
      timeout: 5000,
    });

    const data = {
      id: response.data.id ? String(response.data.id) : null,
      avatarUrl: response.data.avatar_url || null,
    };
    githubUserCache.set(cleanUsername, data);
    return data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.warn(`⚠️ GitHub user "${cleanUsername}" not found on GitHub.`);
    } else if (error.response?.status === 403 && error.response?.headers['x-ratelimit-remaining'] === '0') {
      console.warn(`⚠️ GitHub API rate limit exceeded while resolving "${cleanUsername}". Provide GITHUB_TOKEN to increase limits.`);
    } else {
      console.warn(`⚠️ Failed to resolve GitHub user "${cleanUsername}":`, error.message);
    }
    const fallback = { id: null, avatarUrl: null };
    githubUserCache.set(cleanUsername, fallback);
    return fallback;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function mapDifficulty(val?: string | null): Difficulty {
  if (val === 'Medium') return Difficulty.Medium;
  if (val === 'Hard') return Difficulty.Hard;
  return Difficulty.Easy;
}

function mapVisibility(val?: string | null): ProblemVisibility {
  if (val === 'arena') return ProblemVisibility.ARENA;
  if (val === 'weekly') return ProblemVisibility.WEEKLY;
  return ProblemVisibility.PUBLIC;
}

function mapSubmissionStatus(val?: string | null): SubmissionStatus {
  if (val === 'approved') return SubmissionStatus.APPROVED;
  if (val === 'rejected') return SubmissionStatus.REJECTED;
  return SubmissionStatus.PENDING;
}

function mapContestStatus(val?: string | null): ContestStatus {
  if (val === 'live') return ContestStatus.LIVE;
  if (val === 'ended') return ContestStatus.ENDED;
  return ContestStatus.UPCOMING;
}

function mapRegistrationStatus(val?: string | null): RegistrationStatus {
  if (val === 'confirmed') return RegistrationStatus.CONFIRMED;
  if (val === 'rejected') return RegistrationStatus.REJECTED;
  return RegistrationStatus.PENDING;
}

function mapArenaStatus(val?: string | null): ArenaStatus {
  if (val === 'disqualified') return ArenaStatus.DISQUALIFIED;
  if (val === 'reviewed') return ArenaStatus.REVIEWED;
  return ArenaStatus.SUBMITTED;
}

function mapSubscriberStatus(val?: string | null): SubscriberStatus {
  if (val === 'confirmed' || val === 'active') return SubscriberStatus.ACTIVE;
  if (val === 'pending') return SubscriberStatus.PENDING;
  if (val === 'expired') return SubscriberStatus.EXPIRED;
  if (val === 'cancelled') return SubscriberStatus.CANCELLED;
  return SubscriberStatus.ACTIVE;
}

function mapDiscountType(val?: string | null): DiscountType {
  if (val === 'percentage') return DiscountType.PERCENTAGE;
  return DiscountType.FIXED;
}

function mapCertificateStatus(val?: string | null): CertificateStatus {
  if (val === 'revoked') return CertificateStatus.REVOKED;
  return CertificateStatus.ISSUED;
}

function mapEmailDeliveryStatus(val?: string | null): EmailDeliveryStatus {
  if (val === 'sent') return EmailDeliveryStatus.SENT;
  if (val === 'failed') return EmailDeliveryStatus.FAILED;
  return EmailDeliveryStatus.PENDING;
}

function mapAiFeature(val?: string | null): AiFeature {
  switch (val?.toLowerCase()) {
    case 'explain_failure':
      return AiFeature.EXPLAIN_FAILURE;
    case 'review_code':
      return AiFeature.REVIEW_CODE;
    case 'validate_approach':
      return AiFeature.VALIDATE_APPROACH;
    case 'editorial':
      return AiFeature.EDITORIAL;
    case 'recommendation':
      return AiFeature.RECOMMENDATION;
    default:
      return AiFeature.HINT;
  }
}

function createSlug(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || `problem-${id.slice(0, 8)}`;
}

// ── Main Migration Function ──────────────────────────────────────────

async function runMigration() {
  console.log('════════════════════════════════════════════════════════════');
  console.log(`🚀 BitByBit Migration ETL: Supabase -> Self-Hosted PostgreSQL`);
  console.log(`   Mode: ${isDryRun ? 'DRY-RUN (Simulating, No DB writes)' : isFinalCutover ? 'FINAL CUTOVER' : 'STANDARD'}`);
  console.log('════════════════════════════════════════════════════════════\n');

  // 1. Fetch Admins
  console.log('📥 Fetching Admins from Supabase...');
  const { data: adminsData, error: adminsError } = await supabase.from('admins').select('github');
  if (adminsError) console.warn('⚠️ Could not fetch admins:', adminsError.message);
  const adminHandles = new Set((adminsData || []).map((a: any) => a.github?.toLowerCase()).filter(Boolean));
  console.log(`   Found ${adminHandles.size} admin handle(s).`);

  // 2. Fetch Members & Migrate Users
  console.log('\n📥 Fetching Members from Supabase...');
  const { data: members, error: membersError } = await supabase.from('members').select('*');
  if (membersError) throw new Error(`Failed to fetch members: ${membersError.message}`);
  console.log(`   Found ${members?.length || 0} member record(s).`);

  const userIdByGithub = new Map<string, string>();
  const usersToInsert: any[] = [];

  for (const m of members || []) {
    const username = (m.github || '').trim();
    if (!username) continue;
    const lowerUsername = username.toLowerCase();
    const isAdmin = adminHandles.has(lowerUsername);

    let ghInfo = { id: null as string | null, avatarUrl: null as string | null };
    if (!isDryRun) {
      ghInfo = await fetchGitHubUser(username);
    }

    const userId = m.id;
    userIdByGithub.set(lowerUsername, userId);

    usersToInsert.push({
      id: userId,
      githubId: ghInfo.id,
      githubUsername: lowerUsername,
      name: m.name || username,
      email: m.email || null,
      avatarUrl: ghInfo.avatarUrl,
      role: isAdmin ? UserRole.ADMIN : UserRole.USER,
      totalPoints: m.total_points ?? 0,
      problemsSolved: m.problems_solved ?? 0,
      streak: m.streak ?? 0,
      lastSolvedAt: m.last_solved_at ? new Date(m.last_solved_at) : null,
      createdAt: m.created_at ? new Date(m.created_at) : new Date(),
      updatedAt: new Date(),
    });
  }

  // 3. Fetch Problems & Flatten Test Cases
  console.log('\n📥 Fetching Problems from Supabase...');
  const { data: problems, error: problemsError } = await supabase.from('problems').select('*');
  if (problemsError) throw new Error(`Failed to fetch problems: ${problemsError.message}`);
  console.log(`   Found ${problems?.length || 0} problem record(s).`);

  const problemIds = new Set<string>();
  const problemsToInsert: any[] = [];
  const testCasesToInsert: any[] = [];
  const existingSlugs = new Set<string>();

  for (const p of problems || []) {
    problemIds.add(p.id);
    let slug = createSlug(p.title || 'problem', p.id);
    if (existingSlugs.has(slug)) {
      slug = `${slug}-${p.id.slice(0, 4)}`;
    }
    existingSlugs.add(slug);

    problemsToInsert.push({
      id: p.id,
      title: p.title || 'Untitled Problem',
      slug,
      difficulty: mapDifficulty(p.difficulty),
      points: p.points ?? 100,
      tags: Array.isArray(p.tags) ? p.tags : [],
      description: p.description || '',
      example: p.example || '',
      starterCode: p.starter_code || '',
      paramTypes: Array.isArray(p.param_types) ? p.param_types : [],
      returnType: p.return_type || 'void',
      hints: Array.isArray(p.hints) ? p.hints : [],
      submissionCount: p.submission_count ?? 0,
      isContestProblem: Boolean(p.is_contest_problem),
      visibility: mapVisibility(p.visibility),
      createdAt: p.created_at ? new Date(p.created_at) : new Date(),
      updatedAt: p.updated_at ? new Date(p.updated_at) : new Date(),
    });

    // Flatten legacy JSON test cases
    const testCases = Array.isArray(p.test_cases) ? p.test_cases : [];
    testCases.forEach((tc: any, index: number) => {
      testCasesToInsert.push({
        problemId: p.id,
        input: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input ?? ''),
        expected: typeof tc.expected === 'string' ? tc.expected : JSON.stringify(tc.expected ?? ''),
        isHidden: Boolean(tc.is_hidden),
        explanation: tc.explanation || null,
        orderIndex: index,
        createdAt: p.created_at ? new Date(p.created_at) : new Date(),
      });
    });
  }

  // 4. Fetch Submissions & Backfill UserProblemBest
  console.log('\n📥 Fetching Submissions from Supabase...');
  const { data: submissions, error: submissionsError } = await supabase.from('submissions').select('*');
  if (submissionsError) throw new Error(`Failed to fetch submissions: ${submissionsError.message}`);
  console.log(`   Found ${submissions?.length || 0} submission record(s).`);

  const submissionsToInsert: any[] = [];
  const userProblemBestMap = new Map<string, {
    userId: string;
    problemId: string;
    maxPoints: number;
    isSolved: boolean;
    firstSolvedAt: Date | null;
    bestSubmissionId: string | null;
  }>();

  for (const s of submissions || []) {
    const userGithub = (s.github || '').trim().toLowerCase();
    const userId = userIdByGithub.get(userGithub) || s.user_id;

    if (!userId || !userIdByGithub.has(userGithub)) {
      // If user not in members, check if user ID is known or skip with warning
      if (!userId) {
        console.warn(`⚠️ Skipping submission ${s.id}: User "${s.github}" not found in members.`);
        continue;
      }
    }
    if (!problemIds.has(s.problem_id)) {
      console.warn(`⚠️ Skipping submission ${s.id}: Problem "${s.problem_id}" not found.`);
      continue;
    }

    const pointsAwarded = s.points_awarded ?? 0;
    const isApproved = s.status === 'approved' || (s.tests_total > 0 && s.tests_passed === s.tests_total);
    const subCreatedAt = s.created_at ? new Date(s.created_at) : new Date();

    submissionsToInsert.push({
      id: s.id,
      jobId: null,
      problemId: s.problem_id,
      userId,
      lang: s.lang || 'python',
      code: s.code || '',
      approach: s.approach || '',
      status: mapSubmissionStatus(s.status),
      testsPassed: s.tests_passed ?? 0,
      testsTotal: s.tests_total ?? 0,
      pointsAwarded,
      rejectReason: s.reject_reason || null,
      createdAt: subCreatedAt,
    });

    // Compute UserProblemBest aggregation
    const key = `${userId}:${s.problem_id}`;
    const existing = userProblemBestMap.get(key);

    if (!existing) {
      userProblemBestMap.set(key, {
        userId,
        problemId: s.problem_id,
        maxPoints: pointsAwarded,
        isSolved: isApproved,
        firstSolvedAt: isApproved ? subCreatedAt : null,
        bestSubmissionId: s.id,
      });
    } else {
      if (pointsAwarded > existing.maxPoints) {
        existing.maxPoints = pointsAwarded;
        existing.bestSubmissionId = s.id;
      }
      if (isApproved) {
        existing.isSolved = true;
        if (!existing.firstSolvedAt || subCreatedAt < existing.firstSolvedAt) {
          existing.firstSolvedAt = subCreatedAt;
        }
      }
    }
  }

  const userProblemBestsToInsert = Array.from(userProblemBestMap.values()).map(best => ({
    userId: best.userId,
    problemId: best.problemId,
    bestSubmissionId: best.bestSubmissionId,
    maxPoints: best.maxPoints,
    isSolved: best.isSolved,
    firstSolvedAt: best.firstSolvedAt,
  }));

  // 5. Fetch Contests & Contest Problems
  console.log('\n📥 Fetching Contests & Registrations from Supabase...');
  const { data: contests } = await supabase.from('contests').select('*');
  const contestIds = new Set<string>();
  const contestsToInsert: any[] = [];
  const contestProblemsToInsert: any[] = [];

  for (const c of contests || []) {
    contestIds.add(c.id);
    contestsToInsert.push({
      id: c.id,
      name: c.name || 'Untitled Contest',
      entryFee: c.entry_fee ?? 0,
      durationMins: c.duration_mins ?? 60,
      upiId: c.upi_id || null,
      leaderboardDiscount: c.leaderboard_discount ?? 0,
      status: mapContestStatus(c.status),
      startsAt: c.starts_at ? new Date(c.starts_at) : null,
      createdAt: c.created_at ? new Date(c.created_at) : new Date(),
    });

    const pids = Array.isArray(c.problem_ids) ? c.problem_ids : c.problem_id ? [c.problem_id] : [];
    pids.forEach((pid: string, idx: number) => {
      if (problemIds.has(pid)) {
        contestProblemsToInsert.push({
          contestId: c.id,
          problemId: pid,
          orderIndex: idx,
          points: 100,
        });
      }
    });
  }

  // Contest Registrations
  const { data: contestRegs } = await supabase.from('contest_registrations').select('*');
  const contestRegistrationsToInsert: any[] = [];
  for (const cr of contestRegs || []) {
    const userId = userIdByGithub.get((cr.github || '').trim().toLowerCase()) || cr.user_id;
    if (userId && cr.contest_id && contestIds.has(cr.contest_id)) {
      contestRegistrationsToInsert.push({
        id: cr.id,
        contestId: cr.contest_id,
        userId,
        txnId: cr.txn_id || null,
        razorpayOrderId: cr.razorpay_order_id || null,
        razorpayPaymentId: cr.razorpay_payment_id || null,
        status: mapRegistrationStatus(cr.status),
        createdAt: cr.created_at ? new Date(cr.created_at) : new Date(),
      });
    } else if (cr.contest_id && !contestIds.has(cr.contest_id)) {
      console.warn(`⚠️ Skipping orphan contest registration ${cr.id}: Contest ${cr.contest_id} does not exist.`);
    }
  }

  // Arena Submissions
  const { data: arenaSubs } = await supabase.from('arena_submissions').select('*');
  const arenaSubmissionsToInsert: any[] = [];
  for (const asub of arenaSubs || []) {
    const userId = userIdByGithub.get((asub.github || '').trim().toLowerCase()) || asub.user_id;
    if (userId && asub.contest_id && contestIds.has(asub.contest_id) && asub.problem_id && problemIds.has(asub.problem_id)) {
      arenaSubmissionsToInsert.push({
        id: asub.id,
        contestId: asub.contest_id,
        problemId: asub.problem_id,
        userId,
        lang: asub.lang || 'python',
        code: asub.code || '',
        strikes: asub.strikes ?? 0,
        status: mapArenaStatus(asub.status),
        strikePenaltyFactor: asub.strike_penalty_factor ?? 1.0,
        pointsAwarded: asub.points_awarded ?? 0,
        testsPassed: asub.tests_passed ?? 0,
        testsTotal: asub.tests_total ?? 0,
        createdAt: asub.created_at ? new Date(asub.created_at) : new Date(),
      });
    }
  }

  // 6. Fetch Weekly Challenges & Submissions
  console.log('\n📥 Fetching Weekly Challenges & Submissions...');
  const { data: weeklyChallenges } = await supabase.from('weekly_challenges').select('*');
  const weeklyChallengeIds = new Set<string>();
  const weeklyChallengesToInsert: any[] = [];
  const weeklyChallengeProblemsToInsert: any[] = [];

  for (const wc of weeklyChallenges || []) {
    weeklyChallengeIds.add(wc.id);
    weeklyChallengesToInsert.push({
      id: wc.id,
      title: wc.title || 'Weekly Challenge',
      description: wc.description || '',
      entryFee: wc.entry_fee ?? 0,
      upiId: wc.upi_id || null,
      whatsappLink: wc.whatsapp_link || null,
      startsAt: wc.starts_at ? new Date(wc.starts_at) : new Date(),
      endsAt: wc.ends_at ? new Date(wc.ends_at) : new Date(),
      status: wc.status || 'active',
      createdAt: wc.created_at ? new Date(wc.created_at) : new Date(),
    });

    const pids = Array.isArray(wc.problem_ids) ? wc.problem_ids : [];
    pids.forEach((pid: string, idx: number) => {
      if (problemIds.has(pid)) {
        weeklyChallengeProblemsToInsert.push({
          weeklyChallengeId: wc.id,
          problemId: pid,
          orderIndex: idx,
        });
      }
    });
  }

  const { data: weeklyAccesses } = await supabase.from('weekly_access').select('*');
  const weeklyAccessesToInsert: any[] = [];
  for (const wa of weeklyAccesses || []) {
    const userId = userIdByGithub.get((wa.github || '').trim().toLowerCase()) || wa.user_id;
    if (userId && wa.weekly_challenge_id && weeklyChallengeIds.has(wa.weekly_challenge_id)) {
      weeklyAccessesToInsert.push({
        id: wa.id,
        weeklyChallengeId: wa.weekly_challenge_id,
        userId,
        txnId: wa.txn_id || null,
        status: wa.status || 'confirmed',
        createdAt: wa.created_at ? new Date(wa.created_at) : new Date(),
      });
    }
  }

  const { data: weeklySubs } = await supabase.from('weekly_submissions').select('*');
  const weeklySubmissionsToInsert: any[] = [];
  for (const ws of weeklySubs || []) {
    const userId = userIdByGithub.get((ws.github || '').trim().toLowerCase()) || ws.user_id;
    if (userId && ws.weekly_challenge_id && weeklyChallengeIds.has(ws.weekly_challenge_id) && ws.problem_id && problemIds.has(ws.problem_id)) {
      weeklySubmissionsToInsert.push({
        id: ws.id,
        weeklyChallengeId: ws.weekly_challenge_id,
        problemId: ws.problem_id,
        userId,
        lang: ws.lang || 'python',
        code: ws.code || '',
        status: ws.status || 'approved',
        testsPassed: ws.tests_passed ?? 0,
        testsTotal: ws.tests_total ?? 0,
        pointsAwarded: ws.points_awarded ?? 0,
        submittedAt: ws.submitted_at ? new Date(ws.submitted_at) : new Date(),
        createdAt: ws.created_at ? new Date(ws.created_at) : new Date(),
      });
    }
  }

  // 7. Subscribers & Coupons
  console.log('\n📥 Fetching Subscribers & Coupons...');
  const { data: subscribers } = await supabase.from('subscribers').select('*');
  const subscribersToInsert: any[] = [];
  for (const sub of subscribers || []) {
    const userId = userIdByGithub.get((sub.github || '').trim().toLowerCase()) || sub.user_id;
    if (userId) {
      subscribersToInsert.push({
        id: sub.id,
        userId,
        txnId: sub.txn_id || null,
        razorpayOrderId: sub.razorpay_order_id || null,
        razorpayPaymentId: sub.razorpay_payment_id || null,
        status: mapSubscriberStatus(sub.status),
        currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : new Date(Date.now() + 30 * 86400000),
        createdAt: sub.created_at ? new Date(sub.created_at) : new Date(),
      });
    }
  }

  const { data: coupons } = await supabase.from('coupons').select('*');
  const couponsToInsert: any[] = (coupons || []).map((cp: any) => ({
    id: cp.id,
    code: cp.code,
    discountType: mapDiscountType(cp.discount_type),
    discountValue: cp.discount_value ?? 160,
    isActive: cp.is_active ?? true,
    createdAt: cp.created_at ? new Date(cp.created_at) : new Date(),
  }));

  // 8. Certificates, Email Log, Telemetry
  console.log('\n📥 Fetching Certificates & Telemetry...');
  const validUserIds = new Set(usersToInsert.map((u) => u.id));
  const { data: certificates } = await supabase.from('certificates').select('*');
  const certificatesToInsert: any[] = (certificates || []).map((cert: any) => {
    const rawUserId = userIdByGithub.get((cert.github || '').trim().toLowerCase()) || cert.member_id;
    const userId = rawUserId && validUserIds.has(rawUserId) ? rawUserId : null;
    return {
      id: cert.id,
      certificateId: cert.certificate_id,
      userId,
      recipientName: cert.recipient_name || '',
      recipientEmail: cert.recipient_email || '',
      certificateType: cert.certificate_type || 'Certificate of Achievement',
      title: cert.title || 'CERTIFICATE OF ACHIEVEMENT',
      achievementText: cert.achievement_text || '',
      eventName: cert.event_name || '',
      organizationText: cert.organization_text || 'from teamcodelocked club',
      activityPointsText: cert.activity_points_text || null,
      coordinatorNames: cert.coordinator_names || [],
      issuedAt: cert.issued_at ? new Date(cert.issued_at) : new Date(),
      issuedBy: cert.issued_by || 'Admin',
      pdfPath: cert.pdf_path || '',
      status: mapCertificateStatus(cert.status),
      emailStatus: mapEmailDeliveryStatus(cert.email_status),
      emailError: cert.email_error || null,
      createdAt: cert.created_at ? new Date(cert.created_at) : new Date(),
      updatedAt: cert.updated_at ? new Date(cert.updated_at) : new Date(),
    };
  });

  const { data: emailLogs } = await supabase.from('email_log').select('*');
  const emailLogsToInsert: any[] = (emailLogs || []).map((el: any) => ({
    id: el.id,
    email: el.email || '',
    kind: el.kind || '',
    refId: el.ref_id || '',
    sentAt: el.sent_at ? new Date(el.sent_at) : new Date(),
  }));

  const { data: aiUsages } = await supabase.from('ai_usage').select('*');
  const aiUsagesToInsert: any[] = [];
  for (const au of aiUsages || []) {
    const userId = userIdByGithub.get((au.github || '').trim().toLowerCase()) || au.user_id;
    if (userId) {
      aiUsagesToInsert.push({
        id: au.id,
        userId,
        feature: mapAiFeature(au.feature),
        problemId: au.problem_id || '',
        used: au.used ?? 1,
        date: au.date ? new Date(au.date) : new Date(),
        lastUsedAt: au.last_used_at ? new Date(au.last_used_at) : null,
      });
    }
  }

  const { data: practiceAttempts } = await supabase.from('practice_attempts').select('*');
  const practiceAttemptsToInsert: any[] = [];
  for (const pa of practiceAttempts || []) {
    const userId = userIdByGithub.get((pa.github || '').trim().toLowerCase()) || pa.user_id;
    if (userId && pa.problem_id && problemIds.has(pa.problem_id)) {
      practiceAttemptsToInsert.push({
        id: pa.id,
        problemId: pa.problem_id,
        userId,
        lang: pa.lang || 'python',
        attemptedAt: pa.attempted_at ? new Date(pa.attempted_at) : new Date(),
      });
    }
  }

  const { data: appConfigs } = await supabase.from('app_config').select('*');
  const appConfigsToInsert: any[] = (appConfigs || []).map((ac: any) => ({
    key: ac.key,
    value: ac.value,
  }));

  const { data: collabPages } = await supabase.from('collaborations_page').select('*');
  const collabPagesToInsert: any[] = (collabPages || []).map((cp: any) => ({
    id: cp.id,
    title: cp.title || 'Our Collaborations',
    content: cp.content || '',
    updatedAt: cp.updated_at ? new Date(cp.updated_at) : new Date(),
  }));

  // ── Summary & Dry Run Report ───────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`📊 Migration Summary / Extracted Entity Counts`);
  console.log('════════════════════════════════════════════════════════════');
  console.log(` • Users:                      ${usersToInsert.length}`);
  console.log(` • Problems:                   ${problemsToInsert.length}`);
  console.log(` • Flattened Test Cases:       ${testCasesToInsert.length}`);
  console.log(` • Submissions:                ${submissionsToInsert.length}`);
  console.log(` • UserProblemBest (Backfill): ${userProblemBestsToInsert.length}`);
  console.log(` • Contests:                   ${contestsToInsert.length}`);
  console.log(` • Contest Problems:           ${contestProblemsToInsert.length}`);
  console.log(` • Contest Registrations:      ${contestRegistrationsToInsert.length}`);
  console.log(` • Arena Submissions:          ${arenaSubmissionsToInsert.length}`);
  console.log(` • Weekly Challenges:          ${weeklyChallengesToInsert.length}`);
  console.log(` • Weekly Challenge Problems:  ${weeklyChallengeProblemsToInsert.length}`);
  console.log(` • Weekly Accesses:            ${weeklyAccessesToInsert.length}`);
  console.log(` • Weekly Submissions:         ${weeklySubmissionsToInsert.length}`);
  console.log(` • Subscribers:                ${subscribersToInsert.length}`);
  console.log(` • Coupons:                    ${couponsToInsert.length}`);
  console.log(` • Certificates:               ${certificatesToInsert.length}`);
  console.log(` • Email Logs:                 ${emailLogsToInsert.length}`);
  console.log(` • AI Usages:                  ${aiUsagesToInsert.length}`);
  console.log(` • Practice Attempts:          ${practiceAttemptsToInsert.length}`);
  console.log(` • App Configs:                ${appConfigsToInsert.length}`);
  console.log(` • Collaboration Pages:        ${collabPagesToInsert.length}`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (isDryRun) {
    console.log('✅ DRY-RUN complete. Zero records written to target PostgreSQL database.');
    return;
  }

  // Sanitize user emails to enforce uniqueness
  const seenEmails = new Set<string>();
  for (let i = 0; i < usersToInsert.length; i++) {
    const u = usersToInsert[i];
    let email = (u.email || '').trim().toLowerCase();
    if (!email || seenEmails.has(email)) {
      email = `migrated_user_${u.id || i}@bitbybit.local`;
    }
    seenEmails.add(email);
    u.email = email;
  }

  // ── PostgreSQL Writes ──────────────────────────────────────────────
  console.log('💾 Writing data to PostgreSQL database in transactional batches...');

  await prisma.$transaction(async (tx) => {
    // 1. Users (using where: { id: u.id })
    for (const u of usersToInsert) {
      await tx.user.upsert({
        where: { id: u.id },
        create: u,
        update: u,
      });
    }

    // 2. Problems
    for (const p of problemsToInsert) {
      await tx.problem.upsert({
        where: { id: p.id },
        create: p,
        update: p,
      });
    }

    // 3. Test Cases
    await tx.testCase.deleteMany({});
    if (testCasesToInsert.length > 0) {
      await tx.testCase.createMany({ data: testCasesToInsert });
    }

    // 4. Submissions
    for (const s of submissionsToInsert) {
      await tx.submission.upsert({
        where: { id: s.id },
        create: s,
        update: s,
      });
    }

    // 5. UserProblemBest
    await tx.userProblemBest.deleteMany({});
    if (userProblemBestsToInsert.length > 0) {
      await tx.userProblemBest.createMany({ data: userProblemBestsToInsert, skipDuplicates: true });
    }

    // 6. Contests & Contest Problems
    for (const c of contestsToInsert) {
      await tx.contest.upsert({
        where: { id: c.id },
        create: c,
        update: c,
      });
    }
    await tx.contestProblem.deleteMany({});
    if (contestProblemsToInsert.length > 0) {
      await tx.contestProblem.createMany({ data: contestProblemsToInsert, skipDuplicates: true });
    }

    // Contest Registrations
    await tx.contestRegistration.deleteMany({});
    if (contestRegistrationsToInsert.length > 0) {
      await tx.contestRegistration.createMany({ data: contestRegistrationsToInsert, skipDuplicates: true });
    }

    // Arena Submissions
    await tx.arenaSubmission.deleteMany({});
    if (arenaSubmissionsToInsert.length > 0) {
      await tx.arenaSubmission.createMany({ data: arenaSubmissionsToInsert, skipDuplicates: true });
    }

    // 7. Weekly Challenges
    for (const wc of weeklyChallengesToInsert) {
      await tx.weeklyChallenge.upsert({
        where: { id: wc.id },
        create: wc,
        update: wc,
      });
    }
    await tx.weeklyChallengeProblem.deleteMany({});
    if (weeklyChallengeProblemsToInsert.length > 0) {
      await tx.weeklyChallengeProblem.createMany({ data: weeklyChallengeProblemsToInsert, skipDuplicates: true });
    }
    await tx.weeklyAccess.deleteMany({});
    if (weeklyAccessesToInsert.length > 0) {
      await tx.weeklyAccess.createMany({ data: weeklyAccessesToInsert, skipDuplicates: true });
    }
    await tx.weeklySubmission.deleteMany({});
    if (weeklySubmissionsToInsert.length > 0) {
      await tx.weeklySubmission.createMany({ data: weeklySubmissionsToInsert, skipDuplicates: true });
    }

    // 8. Subscribers & Coupons
    await tx.subscriber.deleteMany({});
    if (subscribersToInsert.length > 0) {
      await tx.subscriber.createMany({ data: subscribersToInsert, skipDuplicates: true });
    }
    await tx.coupon.deleteMany({});
    if (couponsToInsert.length > 0) {
      await tx.coupon.createMany({ data: couponsToInsert, skipDuplicates: true });
    }

    // 9. Certificates & Telemetry
    await tx.certificate.deleteMany({});
    if (certificatesToInsert.length > 0) {
      await tx.certificate.createMany({ data: certificatesToInsert, skipDuplicates: true });
    }
    await tx.emailLog.deleteMany({});
    if (emailLogsToInsert.length > 0) {
      await tx.emailLog.createMany({ data: emailLogsToInsert, skipDuplicates: true });
    }
    await tx.aiUsage.deleteMany({});
    if (aiUsagesToInsert.length > 0) {
      await tx.aiUsage.createMany({ data: aiUsagesToInsert, skipDuplicates: true });
    }
    await tx.practiceAttempt.deleteMany({});
    if (practiceAttemptsToInsert.length > 0) {
      await tx.practiceAttempt.createMany({ data: practiceAttemptsToInsert, skipDuplicates: true });
    }
    for (const ac of appConfigsToInsert) {
      await tx.appConfig.upsert({
        where: { key: ac.key },
        create: ac,
        update: ac,
      });
    }
    for (const cp of collabPagesToInsert) {
      await tx.collaborationPage.upsert({
        where: { id: cp.id },
        create: cp,
        update: cp,
      });
    }
  }, {
    maxWait: 30000,
    timeout: 120000,
  });

  console.log('🎉 ETL Migration successfully completed!');
}

runMigration()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
