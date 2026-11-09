// ════════════════════════════════════════════════════════════
// src/app/api/collaborations/route.ts
// Standalone API handler for Collaborations & Partnerships
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, getSupabaseClient } from '@/lib/supabase';
import type { CollaborationsPageData } from '@/types/collaborations';

export const dynamic = 'force-dynamic';

const DEFAULT_COLLABORATION_DATA: CollaborationsPageData = {
  title: 'Our Collaborations & Partnerships',
  content: `<h2>Empowering Developers Together</h2>
<p>BitByBit collaborates with top collegiate developer clubs, technical organizations, and industry partners to host competitive programming arenas, hackathons, and structured learning cohorts.</p>

<h3>Why Partner With BitByBit?</h3>
<ul>
  <li><strong>High Engagement:</strong> Direct access to an active community of skilled problem solvers and engineers.</li>
  <li><strong>Custom Arena Competitions:</strong> Turnkey proctored coding assessments tailored to your college or organization.</li>
  <li><strong>Verified Credentials:</strong> Issue cryptographically verifiable certificates with activity points recognition.</li>
</ul>

<p>Interested in organizing an event or partnering with BitByBit? Contact our team at <a href="mailto:teamcodelocked@gmail.com">teamcodelocked@gmail.com</a>.</p>`,
  updated_at: new Date().toISOString(),
};

/**
 * Validates whether the caller has administrator privileges
 */
import { getVerifiedAdminUser } from '@/lib/serverAuth';

async function verifyAdminCaller(req: NextRequest): Promise<string | null> {
  const admin = await getVerifiedAdminUser(req);
  return admin ? admin.github : null;
}

/**
 * GET /api/collaborations
 * Retrieves the collaborations page data
 */
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    // eslint-disable-next-line
    const { data, error } = await (supabase.from('collaborations_page') as any)
      .select('id, title, content, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch collaborations from DB, returning defaults:', error.message);
      return NextResponse.json({ data: DEFAULT_COLLABORATION_DATA, source: 'fallback' });
    }

    if (!data) {
      return NextResponse.json({ data: DEFAULT_COLLABORATION_DATA, source: 'default' });
    }

    return NextResponse.json({ data, source: 'database' });
  } catch (err: any) {
    console.error('[/api/collaborations GET error]:', err);
    return NextResponse.json(
      { data: DEFAULT_COLLABORATION_DATA, error: err.message, source: 'error-fallback' },
      { status: 200 }
    );
  }
}

/**
 * POST /api/collaborations
 * Admin endpoint to save title and content updates
 */
export async function POST(req: NextRequest) {
  try {
    const adminGithub = await verifyAdminCaller(req);
    if (!adminGithub) {
      return NextResponse.json({ error: 'Unauthorized: Admin privilege required' }, { status: 403 });
    }

    const body = await req.json();
    const { title, content } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const db = createServerSupabaseClient();

    // Check if row already exists
    // eslint-disable-next-line
    const { data: existing } = await (db.from('collaborations_page') as any)
      .select('id')
      .limit(1)
      .maybeSingle();

    let resultData;
    if (existing?.id) {
      // Update existing record
      // eslint-disable-next-line
      const { data, error } = await (db.from('collaborations_page') as any)
        .update({
          title: title.trim(),
          content: (content || '').trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      resultData = data;
    } else {
      // Insert new record
      // eslint-disable-next-line
      const { data, error } = await (db.from('collaborations_page') as any)
        .insert({
          title: title.trim(),
          content: (content || '').trim(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      resultData = data;
    }

    return NextResponse.json({
      success: true,
      message: 'Collaborations page updated successfully',
      data: resultData,
    });
  } catch (err: any) {
    console.error('[/api/collaborations POST error]:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to update collaborations page' },
      { status: 500 }
    );
  }
}
