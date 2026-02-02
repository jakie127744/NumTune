-- 1. Create Rooms Table
-- Stores the active rooms and their owner (the Host)
create table if not exists public.rooms (
  code text primary key, -- The 4-digit code (e.g. A94B)
  owner_id uuid references auth.users(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on Rooms
alter table public.rooms enable row level security;

-- Rooms Policy: Everyone can read rooms (to join them)
create policy "Allow public read access" on public.rooms for select using (true);

-- Rooms Policy: Only authenticated users can create rooms (Host needs to sign in anonymously)
create policy "Allow authenticated insert" on public.rooms for insert with check (auth.uid() = owner_id);

-- Rooms Policy: Only owner can update/delete
create policy "Allow owner update" on public.rooms for update using (auth.uid() = owner_id);
create policy "Allow owner delete" on public.rooms for delete using (auth.uid() = owner_id);


-- 2. Update Queue Table Policies
-- First, drop existing open policies
drop policy if exists "Allow public read access" on public.queue;
drop policy if exists "Allow public insert" on public.queue;
drop policy if exists "Allow public update" on public.queue;

-- Re-apply Strict Policies

-- QUEUE READ: Everyone can see the queue (unchanged)
create policy "Queue: Public Read" on public.queue for select using (true);

-- QUEUE INSERT: Everyone can add to queue (Guests need this)
-- NOTE: In a stricter world, we might check if 'room_code' exists in 'rooms'.
create policy "Queue: Public Insert" on public.queue for insert with check (true);

-- QUEUE UPDATE/DELETE: Restricted to Room Owner
-- Using a subquery to check if the current user owns the room linked to this queue item
create policy "Queue: Owner Update" on public.queue for update using (
  exists (
    select 1 from public.rooms 
    where rooms.code = queue.room_code 
    and rooms.owner_id = auth.uid()
  )
);

create policy "Queue: Owner Delete" on public.queue for delete using (
  exists (
    select 1 from public.rooms 
    where rooms.code = queue.room_code 
    and rooms.owner_id = auth.uid()
  )
);
