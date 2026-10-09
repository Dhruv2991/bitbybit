-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('Easy', 'Medium', 'Hard');

-- CreateEnum
CREATE TYPE "ProblemVisibility" AS ENUM ('PUBLIC', 'ARENA', 'WEEKLY');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobMode" AS ENUM ('RUN', 'SUBMIT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('UPCOMING', 'LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ArenaStatus" AS ENUM ('SUBMITTED', 'DISQUALIFIED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('ACTIVE', 'CONFIRMED', 'PENDING', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('ISSUED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('HINT', 'EXPLAIN_FAILURE', 'REVIEW_CODE', 'VALIDATE_APPROACH', 'EDITORIAL', 'RECOMMENDATION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "github_id" TEXT,
    "github_username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "avatar_url" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "problems_solved" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "last_solved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problems" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 100,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "starter_code" TEXT NOT NULL,
    "param_types" TEXT[],
    "return_type" TEXT NOT NULL,
    "hints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submission_count" INTEGER NOT NULL DEFAULT 0,
    "is_contest_problem" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "ProblemVisibility" NOT NULL DEFAULT 'PUBLIC',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "input" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "approach" TEXT,
    "mode" "JobMode" NOT NULL DEFAULT 'SUBMIT',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ,
    "locked_by" TEXT,
    "results" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "submission_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "job_id" UUID,
    "problem_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lang" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "approach" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "tests_passed" INTEGER NOT NULL DEFAULT 0,
    "tests_total" INTEGER NOT NULL DEFAULT 0,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "execution_ms" INTEGER,
    "memory_kb" INTEGER,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_problem_bests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "best_submission_id" UUID,
    "max_points" INTEGER NOT NULL DEFAULT 0,
    "is_solved" BOOLEAN NOT NULL DEFAULT false,
    "first_solved_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_problem_bests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contests" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "entry_fee" INTEGER NOT NULL DEFAULT 0,
    "duration_mins" INTEGER NOT NULL,
    "upi_id" TEXT,
    "leaderboard_discount" INTEGER NOT NULL DEFAULT 0,
    "status" "ContestStatus" NOT NULL DEFAULT 'UPCOMING',
    "starts_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_problems" (
    "id" UUID NOT NULL,
    "contest_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "contest_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_registrations" (
    "id" UUID NOT NULL,
    "contest_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "txn_id" TEXT,
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contest_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arena_submissions" (
    "id" UUID NOT NULL,
    "contest_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lang" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "status" "ArenaStatus" NOT NULL DEFAULT 'SUBMITTED',
    "strike_penalty_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "tests_passed" INTEGER NOT NULL DEFAULT 0,
    "tests_total" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arena_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_challenges" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entry_fee" INTEGER NOT NULL DEFAULT 0,
    "upi_id" TEXT,
    "whatsapp_link" TEXT,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_challenge_problems" (
    "id" UUID NOT NULL,
    "weekly_challenge_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "weekly_challenge_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_access" (
    "id" UUID NOT NULL,
    "weekly_challenge_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "txn_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_submissions" (
    "id" UUID NOT NULL,
    "weekly_challenge_id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lang" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "tests_passed" INTEGER NOT NULL DEFAULT 0,
    "tests_total" INTEGER NOT NULL DEFAULT 0,
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscribers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "txn_id" TEXT,
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_period_end" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "discount_type" "DiscountType" NOT NULL DEFAULT 'FIXED',
    "discount_value" DECIMAL(10,2) NOT NULL DEFAULT 160,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "user_id" UUID,
    "recipient_name" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "certificate_type" TEXT NOT NULL DEFAULT 'Certificate of Achievement',
    "title" TEXT NOT NULL DEFAULT 'CERTIFICATE OF ACHIEVEMENT',
    "achievement_text" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "organization_text" TEXT NOT NULL DEFAULT 'from teamcodelocked club',
    "activity_points_text" TEXT,
    "coordinator_names" JSONB NOT NULL DEFAULT '[]',
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" TEXT NOT NULL,
    "pdf_path" TEXT NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'ISSUED',
    "email_status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "email_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "problem_id" TEXT NOT NULL DEFAULT '',
    "used" INTEGER NOT NULL DEFAULT 1,
    "date" DATE NOT NULL,
    "last_used_at" TIMESTAMPTZ,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_attempts" (
    "id" UUID NOT NULL,
    "problem_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lang" TEXT NOT NULL,
    "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "collaborations_page" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Our Collaborations',
    "content" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaborations_page_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_username_key" ON "users"("github_username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_github_username_idx" ON "users"("github_username");

-- CreateIndex
CREATE INDEX "users_github_id_idx" ON "users"("github_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_total_points_idx" ON "users"("total_points" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_token_hash_idx" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "problems_slug_key" ON "problems"("slug");

-- CreateIndex
CREATE INDEX "problems_difficulty_idx" ON "problems"("difficulty");

-- CreateIndex
CREATE INDEX "problems_visibility_idx" ON "problems"("visibility");

-- CreateIndex
CREATE INDEX "test_cases_problem_id_is_hidden_order_index_idx" ON "test_cases"("problem_id", "is_hidden", "order_index");

-- CreateIndex
CREATE INDEX "submission_jobs_status_priority_created_at_idx" ON "submission_jobs"("status", "priority" DESC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "submission_jobs_user_id_status_idx" ON "submission_jobs"("user_id", "status");

-- CreateIndex
CREATE INDEX "submission_jobs_locked_at_idx" ON "submission_jobs"("locked_at");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_job_id_key" ON "submissions"("job_id");

-- CreateIndex
CREATE INDEX "submissions_problem_id_user_id_created_at_idx" ON "submissions"("problem_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "submissions_user_id_created_at_idx" ON "submissions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "submissions_status_idx" ON "submissions"("status");

-- CreateIndex
CREATE INDEX "user_problem_bests_user_id_is_solved_idx" ON "user_problem_bests"("user_id", "is_solved");

-- CreateIndex
CREATE UNIQUE INDEX "user_problem_bests_user_id_problem_id_key" ON "user_problem_bests"("user_id", "problem_id");

-- CreateIndex
CREATE INDEX "contests_status_starts_at_idx" ON "contests"("status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "contest_problems_contest_id_problem_id_key" ON "contest_problems"("contest_id", "problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "contest_registrations_razorpay_order_id_key" ON "contest_registrations"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "contest_registrations_razorpay_payment_id_key" ON "contest_registrations"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "contest_registrations_user_id_idx" ON "contest_registrations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "contest_registrations_contest_id_user_id_key" ON "contest_registrations"("contest_id", "user_id");

-- CreateIndex
CREATE INDEX "arena_submissions_contest_id_problem_id_user_id_idx" ON "arena_submissions"("contest_id", "problem_id", "user_id");

-- CreateIndex
CREATE INDEX "arena_submissions_contest_id_points_awarded_idx" ON "arena_submissions"("contest_id", "points_awarded" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_challenge_problems_weekly_challenge_id_problem_id_key" ON "weekly_challenge_problems"("weekly_challenge_id", "problem_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_access_weekly_challenge_id_user_id_key" ON "weekly_access"("weekly_challenge_id", "user_id");

-- CreateIndex
CREATE INDEX "weekly_submissions_weekly_challenge_id_user_id_idx" ON "weekly_submissions"("weekly_challenge_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_user_id_key" ON "subscribers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_razorpay_order_id_key" ON "subscribers"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_razorpay_payment_id_key" ON "subscribers"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "subscribers_status_current_period_end_idx" ON "subscribers"("status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_code_is_active_idx" ON "coupons"("code", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificate_id_key" ON "certificates"("certificate_id");

-- CreateIndex
CREATE INDEX "certificates_certificate_id_idx" ON "certificates"("certificate_id");

-- CreateIndex
CREATE INDEX "certificates_user_id_idx" ON "certificates"("user_id");

-- CreateIndex
CREATE INDEX "email_log_email_kind_ref_id_idx" ON "email_log"("email", "kind", "ref_id");

-- CreateIndex
CREATE INDEX "ai_usage_user_id_date_idx" ON "ai_usage"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_user_id_feature_problem_id_date_key" ON "ai_usage"("user_id", "feature", "problem_id", "date");

-- CreateIndex
CREATE INDEX "practice_attempts_problem_id_user_id_idx" ON "practice_attempts"("problem_id", "user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_jobs" ADD CONSTRAINT "submission_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_jobs" ADD CONSTRAINT "submission_jobs_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "submission_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_problem_bests" ADD CONSTRAINT "user_problem_bests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_problem_bests" ADD CONSTRAINT "user_problem_bests_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_registrations" ADD CONSTRAINT "contest_registrations_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_registrations" ADD CONSTRAINT "contest_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_submissions" ADD CONSTRAINT "arena_submissions_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_submissions" ADD CONSTRAINT "arena_submissions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_submissions" ADD CONSTRAINT "arena_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_challenge_problems" ADD CONSTRAINT "weekly_challenge_problems_weekly_challenge_id_fkey" FOREIGN KEY ("weekly_challenge_id") REFERENCES "weekly_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_challenge_problems" ADD CONSTRAINT "weekly_challenge_problems_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_access" ADD CONSTRAINT "weekly_access_weekly_challenge_id_fkey" FOREIGN KEY ("weekly_challenge_id") REFERENCES "weekly_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_access" ADD CONSTRAINT "weekly_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_submissions" ADD CONSTRAINT "weekly_submissions_weekly_challenge_id_fkey" FOREIGN KEY ("weekly_challenge_id") REFERENCES "weekly_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_submissions" ADD CONSTRAINT "weekly_submissions_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_submissions" ADD CONSTRAINT "weekly_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
