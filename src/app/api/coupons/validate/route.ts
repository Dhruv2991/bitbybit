import { NextRequest, NextResponse } from "next/server";
import { validateCouponAction } from "@/app/actions/coupons";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { code, basePrice } = body;

    const result = await validateCouponAction(code, typeof basePrice === "number" ? basePrice : 199);
    
    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[/api/coupons/validate] Error:", err);
    return NextResponse.json(
      { valid: false, error: err.message || "Failed to validate coupon" },
      { status: 500 }
    );
  }
}
