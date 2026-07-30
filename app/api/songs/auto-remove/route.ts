import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Created lazily inside the handler (not at module scope) so a missing env
// var returns a 500 at request time instead of throwing during Next.js's
// build-time page-data collection, which would crash the entire deploy.
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

// Auto-removes a song by youtube_id when the Stage reports it broken during
// playback (embedding disabled, removed, private, or not found). Unlike
// /api/songs DELETE this isn't admin/dev-gated - any signed-in session
// (anonymous included) can call it, since it's the Stage itself reporting -
// but it independently re-verifies the video is actually broken via the
// YouTube Data API before deleting, so a malicious client calling this
// directly can't use it to wipe arbitrary library entries.
export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Missing Supabase admin environment variables.' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { youtubeId } = await request.json().catch(() => ({}));
  if (!youtubeId || typeof youtubeId !== 'string') {
    return NextResponse.json({ error: 'Missing youtubeId' }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'YouTube API key not configured on server.' }, { status: 500 });
  }

  try {
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(youtubeId)}&key=${apiKey}`
    );
    const ytData = await ytRes.json();
    const item = ytData.items?.[0];

    // Broken = video no longer exists/is private (no item returned) or it
    // exists but the uploader has disabled embedding.
    const isBroken = !item || item.status?.embeddable === false;

    if (!isBroken) {
      return NextResponse.json({ deleted: false, reason: 'Video verified playable; not deleted.' });
    }

    const { data, error } = await supabaseAdmin.from('songs').delete().eq('youtube_id', youtubeId).select();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true, rows: data });
  } catch (error: any) {
    console.error('auto-remove error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
