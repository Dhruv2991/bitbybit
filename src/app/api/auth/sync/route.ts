import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, email, avatarUrl } = body;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name || user.name,
        email: email || user.email,
        avatarUrl: avatarUrl || user.avatarUrl,
      },
    });

    return NextResponse.json({
      success: true,
      synced: true,
      user: {
        id: updatedUser.id,
        github: updatedUser.githubUsername,
        name: updatedUser.name,
        email: updatedUser.email,
      },
    });
  } catch (err: any) {
    console.error('[/api/auth/sync]', err);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}
