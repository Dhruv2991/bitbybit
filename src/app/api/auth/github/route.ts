import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getGitHubAuthUrl } from '@/lib/auth/github';
import { STATE_COOKIE_NAME } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const state = crypto.randomBytes(24).toString('hex');
  const returnTo = req.nextUrl.searchParams.get('returnTo') || '/';

  // State cookie expires in 10 minutes
  const authUrl = getGitHubAuthUrl(state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE_NAME, `${state}:${encodeURIComponent(returnTo)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes
  });

  return response;
}
