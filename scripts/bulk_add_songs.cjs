require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);

const raw = require('fs').readFileSync(require('path').join(__dirname, 'new_songs.txt'), 'utf8');

function parseLine(line) {
  const sep = line.indexOf('|');
  if (sep === -1) return null;
  const youtubeId = line.slice(0, sep).trim();
  let desc = line.slice(sep + 1).trim();
  if (!youtubeId || !desc || desc.toLowerCase() === 'none') return null;

  let title = null, artist = null, genre = null;

  // Pattern: [MAGICSING Karaoke] ARTIST_TITLE karaoke | Genre
  const magicMatch = desc.match(/^\[MAGICS\w*\s*Karaoke\]\s*(.+)$/i);
  if (magicMatch) {
    let body = magicMatch[1];
    const parts = body.split('|');
    let main = parts[0].trim();
    genre = parts[1] ? parts[1].trim() : 'Tagalog';
    main = main.replace(/karaoke\s*\d*\s*$/i, '').trim();
    const us = main.indexOf('_');
    if (us !== -1) {
      artist = main.slice(0, us).trim();
      title = main.slice(us + 1).trim();
    } else {
      title = main;
      artist = 'Unknown';
    }
    return { youtubeId, title, artist, genre };
  }

  // Pattern: ... - as popularized by ARTIST  /  ... - in the style of ARTIST
  const byMatch = desc.match(/^(.*?)\s*-\s*(?:as popularized by|in the style of)\s*(.+)$/i);
  if (byMatch) {
    artist = byMatch[2].trim();
    title = byMatch[1]
      .replace(/\(.*?karaoke.*?\)/gi, '')
      .replace(/-\s*karaoke version\s*-?\s*$/i, '')
      .replace(/-\s*\(?karaoke\)?\s*$/i, '')
      .replace(/[-\s]+$/, '')
      .trim();
    return { youtubeId, title, artist, genre };
  }

  // Pattern: TITLE - ARTIST (BEST KARAOKE with Score)
  const scoreMatch = desc.match(/^(.*)\(BEST KARAOKE with Score\)\s*$/i);
  if (scoreMatch) {
    const body = scoreMatch[1].trim();
    const lastDash = body.lastIndexOf(' - ');
    if (lastDash !== -1) {
      title = body.slice(0, lastDash).trim();
      artist = body.slice(lastDash + 3).trim();
    } else {
      title = body;
      artist = 'Unknown';
    }
    return { youtubeId, title, artist, genre };
  }

  // Generic: strip any trailing (...karaoke...) parenthetical, then split on " - "
  const parenMatch = desc.match(/^(.*?)\s*\((?:[^()]*karaoke[^()]*)\)\s*$/i);
  let body = parenMatch ? parenMatch[1].trim() : desc;
  const dash = body.indexOf(' - ');
  if (dash !== -1) {
    title = body.slice(0, dash).trim();
    artist = body.slice(dash + 3).trim();
  } else {
    title = body;
    artist = 'Unknown';
  }
  return { youtubeId, title, artist, genre };
}

async function main() {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const parsed = lines.map(parseLine).filter(Boolean);

  console.log(`Parsed ${parsed.length} of ${lines.length} lines`);

  const { data: existing } = await supabase.from('songs').select('youtube_id');
  const existingIds = new Set((existing || []).map(s => s.youtube_id));

  const toInsert = parsed.filter(s => !existingIds.has(s.youtubeId));
  console.log(`${parsed.length - toInsert.length} already in DB, ${toInsert.length} new`);

  if (toInsert.length === 0) {
    console.log('Nothing to insert.');
    return;
  }

  const { data: maxRow } = await supabase
    .from('songs')
    .select('song_number')
    .order('song_number', { ascending: false })
    .limit(1)
    .single();

  let nextNumber = (maxRow?.song_number || 9999) + 1;

  const rows = toInsert.map(s => ({
    song_number: nextNumber++,
    title: s.title || 'Untitled',
    artist: s.artist || 'Unknown',
    youtube_id: s.youtubeId,
    genre: s.genre || null,
    thumbnail_url: `https://i.ytimg.com/vi/${s.youtubeId}/hqdefault.jpg`,
  }));

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    let { error } = await supabase.from('songs').upsert(chunk, { onConflict: 'youtube_id', ignoreDuplicates: true });
    // rows is already pre-filtered against existingIds above, so plain insert
    // is a safe fallback if migration_songs_unique_youtube_id.sql hasn't run yet.
    if (error && error.message && error.message.includes('no unique or exclusion constraint')) {
      console.warn('songs.youtube_id unique constraint not found - falling back to plain insert.');
      const fallback = await supabase.from('songs').insert(chunk);
      error = fallback.error;
    }
    if (error) {
      console.error('Insert error at chunk', i, error);
      process.exit(1);
    }
    console.log(`Inserted rows ${i + 1}-${i + chunk.length}`);
  }

  console.log(`Done. Inserted ${rows.length} songs, song_number ${rows[0].song_number}-${rows[rows.length - 1].song_number}`);
}

main();
