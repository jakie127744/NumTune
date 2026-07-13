-- Replace timestamp-swap based queue reordering with a real position column.
-- moveQueueItem() used to swap created_at between two rows to reorder them.
-- Since fetchQueue() sorts by created_at then id as a tiebreaker, colliding
-- timestamps (which this very swap could produce) could cause reorders to
-- silently revert to insertion order. An explicit integer position column
-- is unambiguous and trivial to swap safely.

alter table public.queue add column if not exists position bigint;

-- Backfill existing rows: number them in their current (created_at, id) order,
-- scoped per room so each room's queue starts its own sequence.
with ranked as (
  select id, row_number() over (partition by room_code order by created_at asc, id asc) as rn
  from public.queue
)
update public.queue q
set position = ranked.rn
from ranked
where q.id = ranked.id
  and q.position is null;

create index if not exists queue_room_position_idx on public.queue (room_code, position);
