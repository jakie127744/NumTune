-- Prevent duplicate songs at the database level.
-- Without this, concurrent "add song" submissions (two guests, or host +
-- guest, adding the same YouTube video around the same time) can both pass
-- an in-memory/client-side duplicate check and insert two rows for the same
-- video under different song_numbers.

-- Clean up any existing duplicates first, keeping the lowest song_number per youtube_id.
delete from public.songs a
using public.songs b
where a.youtube_id = b.youtube_id
  and a.song_number > b.song_number;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'songs_youtube_id_key'
  ) then
    alter table public.songs
      add constraint songs_youtube_id_key unique (youtube_id);
  end if;
end $$;
