"use server";
// ════════════════════════════════════════════════════════════
// src/app/actions/unsubscribe.ts
// Server Actions for Email Opt-Out & Subscription Management
// ════════════════════════════════════════════════════════════

import { createServerSupabaseClient, getSupabaseClient } from "@/lib/supabase";
import { isEmailSubscribed } from "@/lib/email";

export interface UnsubscribeResponse {
  success: boolean;
  email?: string;
  isSubscribed?: boolean;
  message?: string;
  error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

/**
 * Opts out an email address from all promotional/marketing emails.
 * Updates members, subscribers, and records audit row in email_unsubscribes.
 */
export async function unsubscribeEmailAction(
  rawEmail: string,
  reason: string = "User requested via web unsubscribe page"
): Promise<UnsubscribeResponse> {
  try {
    const email = sanitizeEmail(rawEmail);

    if (!email || !EMAIL_REGEX.test(email)) {
      return {
        success: false,
        error: "Please provide a valid email address.",
      };
    }

    let db;
    try {
      db = createServerSupabaseClient();
    } catch {
      db = getSupabaseClient();
    }

    const now = new Date().toISOString();

    // 1. Update members table (user accounts/profiles)
    // eslint-disable-next-line
    const { error: membersErr } = await (db.from("members") as any)
      .update({ email_subscribed: false })
      .ilike("email", email);

    if (membersErr) {
      console.warn("[unsubscribeAction] Warning updating members table:", membersErr.message);
    }

    // 2. Update subscribers table (paid subscribers)
    // eslint-disable-next-line
    const { error: subsErr } = await (db.from("subscribers") as any)
      .update({ email_subscribed: false })
      .ilike("email", email);

    if (subsErr) {
      console.warn("[unsubscribeAction] Warning updating subscribers table:", subsErr.message);
    }

    // 3. Upsert into dedicated email_unsubscribes audit table
    // eslint-disable-next-line
    const { error: auditErr } = await (db.from("email_unsubscribes") as any)
      .upsert(
        {
          email,
          reason,
          source: "web_page",
          unsubscribed_at: now,
        },
        { onConflict: "email" }
      );

    if (auditErr) {
      console.warn("[unsubscribeAction] Warning recording email_unsubscribes entry:", auditErr.message);
    }

    return {
      success: true,
      email,
      isSubscribed: false,
      message: "You have been successfully unsubscribed from promotional and marketing emails.",
    };
  } catch (err: any) {
    console.error("[unsubscribeEmailAction] Unexpected error:", err);
    return {
      success: false,
      error: err?.message || "An unexpected error occurred while processing your request.",
    };
  }
}

/**
 * Allows a user who unsubscribed by mistake to re-subscribe to updates.
 */
export async function resubscribeEmailAction(
  rawEmail: string
): Promise<UnsubscribeResponse> {
  try {
    const email = sanitizeEmail(rawEmail);

    if (!email || !EMAIL_REGEX.test(email)) {
      return {
        success: false,
        error: "Please provide a valid email address.",
      };
    }

    let db;
    try {
      db = createServerSupabaseClient();
    } catch {
      db = getSupabaseClient();
    }

    // 1. Update members table
    // eslint-disable-next-line
    await (db.from("members") as any)
      .update({ email_subscribed: true })
      .ilike("email", email);

    // 2. Update subscribers table
    // eslint-disable-next-line
    await (db.from("subscribers") as any)
      .update({ email_subscribed: true })
      .ilike("email", email);

    // 3. Remove from opt-out table
    // eslint-disable-next-line
    await (db.from("email_unsubscribes") as any)
      .delete()
      .ilike("email", email);

    return {
      success: true,
      email,
      isSubscribed: true,
      message: "Your subscription preferences have been updated. You are now re-subscribed to Bit by Bit updates.",
    };
  } catch (err: any) {
    console.error("[resubscribeEmailAction] Unexpected error:", err);
    return {
      success: false,
      error: err?.message || "An unexpected error occurred while updating your preferences.",
    };
  }
}

/**
 * Checks the current subscription status for a given email.
 */
export async function checkEmailSubscriptionStatusAction(
  rawEmail: string
): Promise<UnsubscribeResponse> {
  try {
    const email = sanitizeEmail(rawEmail);
    if (!email || !EMAIL_REGEX.test(email)) {
      return {
        success: false,
        error: "Please provide a valid email address.",
      };
    }

    const isSubscribed = await isEmailSubscribed(email);
    return {
      success: true,
      email,
      isSubscribed,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to check subscription status.",
    };
  }
}
