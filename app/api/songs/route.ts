import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Use service role key to bypass RLS for admin operations. Created lazily
// inside the handler (not at module scope) so a missing env var returns a
// 500 at request time instead of throwing during Next.js's build-time
// page-data collection, which would crash the entire deploy.
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

async function requireAuthenticatedHost(supabaseAdmin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function DELETE(request: Request) {
  // Deleting songs is restricted to dev environments and a single admin
  // account, to prevent accidental/malicious destruction of the live library.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Song deletion is disabled in production' }, { status: 403 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Missing Supabase admin environment variables.' }, { status: 500 });
  }

  const user = await requireAuthenticatedHost(supabaseAdmin, request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized: host sign-in required' }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized: only the admin account can delete songs' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const songId = searchParams.get('id');
  const youtubeId = searchParams.get('youtube_id');

  if (!songId && !youtubeId) {
    return NextResponse.json({ error: 'Missing id or youtube_id parameter' }, { status: 400 });
  }

  try {
    let query = supabaseAdmin.from('songs').delete();
    query = songId ? query.eq('id', parseInt(songId)) : query.eq('youtube_id', youtubeId!);
    const { data, error } = await query.select();

    if (error) {
      console.error('Delete song error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: data });
  } catch (error: any) {
    console.error('Server-side delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
