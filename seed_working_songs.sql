-- Add some verified working Karaoke songs to testing
-- Run this in Supabase SQL Editor

INSERT INTO public.songs (song_number, title, artist, youtube_id, duration)
VALUES 
(9991, 'Don''t Stop Believin'' (Karaoke)', 'Journey', 'VjdOUP84_To', '04:10'),
(9992, 'Sweet Caroline (Karaoke)', 'Neil Diamond', 'm6Fh78V_e58', '03:22'),
(9993, 'Bohemian Rhapsody (Karaoke)', 'Queen', 'fJ9rUzIMcZQ', '06:00')
ON CONFLICT (song_number) DO UPDATE 
SET youtube_id = EXCLUDED.youtube_id,
    title = EXCLUDED.title,
    artist = EXCLUDED.artist;

-- Check they are there
SELECT * FROM songs WHERE song_number >= 9991;
