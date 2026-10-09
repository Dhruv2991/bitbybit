import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, getGitHubUserProfile } from '@/lib/auth/github';
import {
  createSession,
  SESSION_COOKIE_NAME,
  STATE_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');

  const stateCookie = req.cookies.get(STATE_COOKIE_NAME)?.value;
  if (!stateCookie || !state) {
    return NextResponse.json({ error: 'Missing or expired OAuth state parameter' }, { status: 403 });
  }

  const [savedState, returnToEncoded] = stateCookie.split(':');
  if (savedState !== state) {
    return NextResponse.json({ error: 'OAuth state mismatch (possible CSRF)' }, { status: 403 });
  }

  const returnTo = returnToEncoded ? decodeURIComponent(returnToEncoded) : '/';

  if (!code) {
    return NextResponse.json({ error: 'Missing OAuth authorization code' }, { status: 400 });
  }

  try {
    // 1. Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);

    // 2. Fetch GitHub Profile
    const profile = await getGitHubUserProfile(accessToken);
    const githubId = String(profile.id);
    const githubUsername = profile.login.toLowerCase().trim();
    const name = profile.name || profile.login;
    const email = profile.email || `user_${githubId}@bitbybit.local`;
    const avatarUrl = profile.avatar_url;

    // 3. Upsert User in local PostgreSQL database
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { githubId },
          { githubUsername },
        ],
      },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubId,
          githubUsername,
          name: name || user.name,
          email: profile.email || user.email,
          avatarUrl: avatarUrl || user.avatarUrl,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          githubId,
          githubUsername,
          name,
          email,
          avatarUrl,
          role: UserRole.USER,
        },
      });
    }

    // 4. Create local session in PostgreSQL
    const { token: sessionSecret } = await createSession(user.id, req);

    // 5. Build Redirect response with Session Cookie
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
    const redirectTarget = returnTo.startsWith('/') ? `${siteUrl}${returnTo}` : returnTo;

    const response = NextResponse.redirect(redirectTarget);

    response.cookies.set(SESSION_COOKIE_NAME, sessionSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });

    // Clear state cookie
    response.cookies.delete(STATE_COOKIE_NAME);

    return response;
  } catch (err: any) {
    console.error('[/api/auth/callback]', err);
    return NextResponse.json({ error: err.message || 'Authentication failed' }, { status: 500 });
  }
}
