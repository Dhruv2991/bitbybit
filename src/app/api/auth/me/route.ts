import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        githubId: user.githubId,
        github: user.githubUsername,
        githubUsername: user.githubUsername,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isAdmin: user.isAdmin,
        isSubscriber: user.isSubscriber,
        totalPoints: user.totalPoints,
        problemsSolved: user.problemsSolved,
        streak: user.streak,
        subscription: user.subscription
          ? {
              status: user.subscription.status,
              currentPeriodEnd: user.subscription.currentPeriodEnd,
            }
          : null,
      },
    });
  } catch (err: any) {
    console.error('[/api/auth/me]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch session' }, { status: 500 });
  }
}
