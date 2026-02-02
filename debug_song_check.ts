
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSongs() {
  const { data, error } = await supabase
    .from('songs')
    .select('song_number, title, artist')
    .in('song_number', [10224, 10244]);

  if (error) {
    console.error('Error fetching songs:', error);
  } else {
    console.log('Songs found:');
    data.forEach(song => {
      console.log(`${song.song_number}: ${song.title} - ${song.artist}`);
    });
  }
}

checkSongs();
