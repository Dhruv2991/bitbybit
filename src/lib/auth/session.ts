import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { User, Subscriber } from '@prisma/client';

export const SESSION_COOKIE_NAME = 'bb_session';
export const STATE_COOKIE_NAME = 'oauth_state';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface AuthenticatedUser extends User {
  subscription: Subscriber | null;
  isAdmin: boolean;
  isSubscriber: boolean;
}

/**
 * Computes SHA-256 hash of a raw session secret token.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new session in PostgreSQL and returns the unhashed secret token.
 */
export async function createSession(
  userId: string,
  req?: NextRequest
): Promise<{ token: string; expiresAt: Date }> {
  const rawSecret = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawSecret);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  const ipAddress = req
    ? req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.ip || null
    : null;
  const userAgent = req ? req.headers.get('user-agent') || null : null;

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  return { token: rawSecret, expiresAt };
}

/**
 * Resolves an authenticated user from a raw session secret token.
 */
export async function getSessionUser(token: string): Promise<AuthenticatedUser | null> {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          subscription: true,
        },
      },
    },
  });

  if (!session) return null;

  // Check expiration
  if (session.expiresAt < new Date()) {
    // Delete expired session asynchronously
    prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const { user } = session;
  const isSubscriber = Boolean(
    user.subscription &&
      user.subscription.status === 'ACTIVE' &&
      user.subscription.currentPeriodEnd > new Date()
  );

  return {
    ...user,
    subscription: user.subscription,
    isAdmin: user.role === 'ADMIN',
    isSubscriber,
  };
}

/**
 * Destroys a session by token.
 */
export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  await prisma.session.deleteMany({
    where: { tokenHash },
  });
}

/**
 * Reads the current session cookie and returns the authenticated user (for server components and route handlers).
 */
export async function getCurrentUser(req?: NextRequest): Promise<AuthenticatedUser | null> {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }
  } else {
    try {
      const cookieStore = cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      return null;
    }
  }

  if (!token) return null;
  return await getSessionUser(token);
}
