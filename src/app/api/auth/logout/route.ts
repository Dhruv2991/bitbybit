import { NextRequest, NextResponse } from 'next/server';
import { destroySession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

async function handleLogout(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await destroySession(token).catch(() => {});
  }

  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

export async function POST(req: NextRequest) {
  return handleLogout(req);
}

export async function GET(req: NextRequest) {
  const redirectTarget = req.nextUrl.searchParams.get('returnTo') || '/';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await destroySession(token).catch(() => {});
  }

  const response = NextResponse.redirect(
    redirectTarget.startsWith('/') ? `${siteUrl}${redirectTarget}` : redirectTarget
  );
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
