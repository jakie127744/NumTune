
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase's PostgREST API caps any single query at 1000 rows by default.
// This pages through with .range() so libraries larger than 1000 songs load in full.
export async function fetchAllRows<T = any>(
  table: string,
  configure?: (query: ReturnType<ReturnType<typeof supabase.from>['select']>) => any
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: T[] = [];

  while (true) {
    let query: any = supabase.from(table).select('*');
    if (configure) query = configure(query);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error || !data) break;

    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// Removes a song from the library by youtube_id (e.g. when YouTube reports it
// as restricted/removed) so it's never queued/selected again. Requires an
// authenticated session (anonymous counts) - calls the service-role-backed
// /api/songs route rather than deleting client-side, since songs has no
// client-facing delete RLS policy.
export async function removeSongByYoutubeId(youtubeId: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) return false;
    }
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    if (!freshSession?.access_token) return false;

    const res = await fetch(`/api/songs?youtube_id=${encodeURIComponent(youtubeId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${freshSession.access_token}` },
    });
    return res.ok;
  } catch (e) {
    console.error('removeSongByYoutubeId failed:', e);
    return false;
  }
}

// Inserts a song, treating youtube_id as the de-dupe key. Prefers an atomic
// upsert (requires migration_songs_unique_youtube_id.sql for the unique
// constraint it relies on). If that migration hasn't been run yet, falls
// back to a manual select-then-insert so "add song" doesn't hard-fail.
export async function upsertSongByYoutubeId<T = any>(song: Record<string, any>): Promise<{ data: T | null; error: any }> {
  const { data, error } = await supabase
    .from('songs')
    .upsert([song], { onConflict: 'youtube_id', ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (error?.message?.includes('no unique or exclusion constraint')) {
    console.warn('songs.youtube_id unique constraint not found yet (run migration_songs_unique_youtube_id.sql) - falling back to manual dedupe.');
    const { data: existing } = await supabase.from('songs').select('*').eq('youtube_id', song.youtube_id).maybeSingle();
    if (existing) return { data: existing as T, error: null };

    const inserted = await supabase.from('songs').insert([song]).select().maybeSingle();
    return { data: inserted.data as T, error: inserted.error };
  }

  if (error) return { data: null, error };

  if (!data) {
    // Conflict was ignored (song already existed) - fetch the existing row.
    const { data: existing } = await supabase.from('songs').select('*').eq('youtube_id', song.youtube_id).maybeSingle();
    return { data: existing as T, error: null };
  }

  return { data: data as T, error: null };
}
