-- Tighten Songs Table Policies
-- Previously "Allow anon insert" allowed literally anyone (even fully unauthenticated
-- requests using only the public anon key) to insert rows into public.songs.
-- This restricts inserts to sessions with a valid Supabase auth session
-- (anonymous sign-in counts, since the app treats that as "logged in" host/guest).
-- Update/delete remain default-deny (no policy = no access) since the app never
-- needs direct client-side update/delete on songs; deletion goes through the
-- service-role-backed /api/songs route, which now requires an authenticated session.

drop policy if exists "Allow anon insert" on public.songs;
drop policy if exists "Songs: Authenticated insert" on public.songs;

create policy "Songs: Authenticated insert" on public.songs
  for insert
  with check (auth.uid() is not null);
