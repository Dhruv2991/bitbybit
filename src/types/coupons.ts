// ════════════════════════════════════════════════════════════
// src/types/coupons.ts
// ════════════════════════════════════════════════════════════

export type DiscountType = 'fixed' | 'percentage';

export interface Coupon {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  is_active: boolean;
  created_at: string;
}

export interface CouponValidationResponse {
  valid: boolean;
  error?: string;
  coupon?: {
    id: string;
    code: string;
    discount_type: DiscountType;
    discount_value: number;
  };
  basePrice?: number;
  discountAmount?: number;
  finalPrice?: number;
}

export interface CreateCouponInput {
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  is_active?: boolean;
}
