"use server";
// ════════════════════════════════════════════════════════════
// src/app/actions/coupons.ts
// Server Actions for Coupon Management & Secure Validation
// ════════════════════════════════════════════════════════════

import { createServerSupabaseClient, getSupabaseClient } from "@/lib/supabase";
import type { Coupon, CreateCouponInput, CouponValidationResponse } from "@/types/coupons";

/**
 * Validates a promo/coupon code server-side and computes the discounted price.
 * Default base price is $199 unless specified.
 */
export async function validateCouponAction(
  rawCode: string,
  basePrice: number = 199
): Promise<CouponValidationResponse> {
  try {
    const code = (rawCode || "").trim().toUpperCase();
    if (!code) {
      return { valid: false, error: "Please enter a coupon code." };
    }

    if (basePrice < 0) {
      return { valid: false, error: "Invalid base price." };
    }

    // Use server client if available (service role) or fallback to standard client
    let db;
    try {
      db = createServerSupabaseClient();
    } catch {
      db = getSupabaseClient();
    }

    // eslint-disable-next-line
    const { data: coupon, error } = await (db.from("coupons") as any)
      .select("id, code, discount_type, discount_value, is_active")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("[validateCouponAction] Database error:", error);
      return { valid: false, error: "Failed to validate coupon. Please try again." };
    }

    if (!coupon) {
      return { valid: false, error: `Coupon code "${code}" is invalid.` };
    }

    if (!coupon.is_active) {
      return { valid: false, error: `Coupon code "${code}" is inactive or expired.` };
    }

    const discountValue = Number(coupon.discount_value) || 0;
    let discountAmount = 0;

    if (coupon.discount_type === "percentage") {
      discountAmount = Math.round(((basePrice * discountValue) / 100) * 100) / 100;
    } else {
      // Fixed discount
      discountAmount = Math.min(basePrice, discountValue);
    }

    const finalPrice = Math.max(0, Math.round((basePrice - discountAmount) * 100) / 100);

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: discountValue,
      },
      basePrice,
      discountAmount,
      finalPrice,
    };
  } catch (err: any) {
    console.error("[validateCouponAction] Unexpected error:", err);
    return { valid: false, error: err.message || "An unexpected error occurred." };
  }
}

/**
 * Fetches all coupons for admin management.
 */
export async function getCouponsAction(): Promise<{
  success: boolean;
  coupons?: Coupon[];
  error?: string;
}> {
  try {
    let db;
    try {
      db = createServerSupabaseClient();
    } catch {
      db = getSupabaseClient();
    }

    // eslint-disable-next-line
    const { data, error } = await (db.from("coupons") as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getCouponsAction] Error fetching coupons:", error);
      return { success: false, error: error.message };
    }

    return { success: true, coupons: (data as Coupon[]) || [] };
  } catch (err: any) {
    console.error("[getCouponsAction] Exception:", err);
    return { success: false, error: err.message || "Failed to load coupons." };
  }
}

/**
 * Creates a new coupon code.
 */
export async function createCouponAction(
  input: CreateCouponInput
): Promise<{
  success: boolean;
  coupon?: Coupon;
  error?: string;
}> {
  try {
    const rawCode = (input.code || "").trim().toUpperCase();
    if (!rawCode) {
      return { success: false, error: "Coupon code is required." };
    }

    // Ensure valid alphanumeric and underscore format
    if (!/^[A-Z0-9_-]+$/.test(rawCode)) {
      return {
        success: false,
        error: "Coupon code may only contain uppercase letters, numbers, hyphens, and underscores.",
      };
    }

    const discountType = input.discount_type === "percentage" ? "percentage" : "fixed";
    const discountValue = Number(input.discount_value);

    if (isNaN(discountValue) || discountValue <= 0) {
      return { success: false, error: "Discount value must be greater than 0." };
    }

    if (discountType === "percentage" && discountValue > 100) {
      return { success: false, error: "Percentage discount cannot exceed 100%." };
    }

    const isActive = input.is_active ?? true;

    let db;
    try {
      db = createServerSupabaseClient();
    } catch {
      db = getSupabaseClient();
    }

    // eslint-disable-next-line
    const { data, error } = await (db.from("coupons") as any)
      .insert({
        code: rawCode,
        discount_type: discountType,
        discount_value: discountValue,
        is_active: isActive,
      })
      .select()
      .single();

    if (error) {
      console.error("[createCouponAction] Error creating coupon:", error);
      if (error.code === "23505" || error.message?.includes("unique")) {
        return { success: false, error: `Coupon code "${rawCode}" already exists.` };
      }
      return { success: false, error: error.message || "Failed to create coupon." };
    }

    return { success: true, coupon: data as Coupon };
  } catch (err: any) {
    console.error("[createCouponAction] Exception:", err);
    return { success: false, error: err.message || "Failed to create coupon." };
  }
}

/**
 * Toggles a coupon's active status.
 */
export async function toggleCouponActiveAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) {
      return { success: false, error: "Coupon ID is required." };
    }

    let db;
    try {
      db = createServerSupabaseClient();
    } catch {
      db = getSupabaseClient();
    }

    // eslint-disable-next-line
    const { error } = await (db.from("coupons") as any)
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) {
      console.error("[toggleCouponActiveAction] Error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[toggleCouponActiveAction] Exception:", err);
    return { success: false, error: err.message || "Failed to update coupon status." };
  }
}

/**
 * Deletes a coupon code.
 */
export async function deleteCouponAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!id) {
      return { success: false, error: "Coupon ID is required." };
    }

    let db;
    try {
      db = createServerSupabaseClient();
    } catch {
      db = getSupabaseClient();
    }

    // eslint-disable-next-line
    const { error } = await (db.from("coupons") as any)
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[deleteCouponAction] Error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[deleteCouponAction] Exception:", err);
    return { success: false, error: err.message || "Failed to delete coupon." };
  }
}
