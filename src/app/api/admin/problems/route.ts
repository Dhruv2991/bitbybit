// ════════════════════════════════════════════════════════════
// src/app/api/admin/problems/route.ts
// POST /api/admin/problems   — create a new problem
// PUT  /api/admin/problems   — update an existing problem (requires ?id=)
// DELETE /api/admin/problems — delete a problem (requires ?id=)
//
// All writes go through the service role (bypasses RLS).
// Admin identity is verified server-side via the Supabase auth
// session token + a DB check against the `admins` table — NOT
// via JWT user_metadata (which is user-editable).
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { Problem } from '@/types/database';

export const dynamic = 'force-dynamic';

/**
 * Verifies the caller is an admin by:
 * 1. Extracting the Bearer token from the Authorization header.
 * 2. Resolving the Supabase user from auth.users (not JWT metadata).
 * 3. Cross-checking the GitHub username against the admins table using
 *    the service role client.
 *
 * Returns the verified github username, or null if check fails.
 */
async function getVerifiedAdminGithub(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  // Resolve the actual user from Supabase auth — not from JWT claims
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return null;

  // Get github strictly from auth.identities (provider=github), NOT user_metadata
  const githubIdentity = userData.user.identities?.find(
    (id) => id.provider === 'github',
  );
  const github = githubIdentity?.identity_data?.user_name as string | undefined;
  if (!github) return null;

  // DB-level admin check using service role
  const db = createServerSupabaseClient();
  const { data: adminRow } = await (db.from('admins') as any)
    .select('github')
    .eq('github', github)
    .maybeSingle();

  return adminRow ? github : null;
}

// ── GET — fetch problems with full details & test cases (service role) ─────────
export async function GET(req: NextRequest) {
  try {
    const github = await getVerifiedAdminGithub(req);
    if (!github) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get('id');
    const db = createServerSupabaseClient();

    if (id) {
      const { data, error } = await (db.from('problems') as any)
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
      return NextResponse.json(data);
    }

    const { data, error } = await (db.from('problems') as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error('[GET /api/admin/problems]', err);
    return NextResponse.json({ error: err.message || 'Fetch failed' }, { status: 500 });
  }
}

// ── POST — create a new problem ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const github = await getVerifiedAdminGithub(req);
    if (!github) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const db = createServerSupabaseClient();

    // Strip id/created_at/updated_at — let Postgres generate them
    const { id: _id, created_at: _ca, updated_at: _ua, ...payload } = body as Partial<Problem> & Record<string, unknown>;

    const { data, error } = await (db.from('problems') as any)
      .insert([payload])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/admin/problems]', err);
    return NextResponse.json({ error: err.message || 'Create failed' }, { status: 500 });
  }
}

// ── PUT — update an existing problem ─────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const github = await getVerifiedAdminGithub(req);
    if (!github) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing ?id= param' }, { status: 400 });
    }

    const body = await req.json();
    const db = createServerSupabaseClient();

    const { id: _id, created_at: _ca, updated_at: _ua, ...payload } = body as Partial<Problem> & Record<string, unknown>;

    // The PUT route must not write test_cases unless the request includes it explicitly and it is non-empty.
    if (payload.test_cases !== undefined) {
      if (!Array.isArray(payload.test_cases) || payload.test_cases.length === 0) {
        delete payload.test_cases;
      }
    }

    const { data, error } = await (db.from('problems') as any)
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[PUT /api/admin/problems]', err);
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: 500 });
  }
}

// ── DELETE — remove a problem ─────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const github = await getVerifiedAdminGithub(req);
    if (!github) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing ?id= param' }, { status: 400 });
    }

    const db = createServerSupabaseClient();
    const { error } = await db.from('problems').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ deleted: id });
  } catch (err: any) {
    console.error('[DELETE /api/admin/problems]', err);
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 });
  }
}

