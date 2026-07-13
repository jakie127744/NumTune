-- Atomic "advance queue" operation.
-- Previously playNext() did this as two separate round trips from the client
-- (1. stop the currently playing row, 2. pick + start the next queued row).
-- Two callers racing (e.g. the Stage view's auto-end-of-song timer firing at
-- the same moment the host clicks Skip) could each see a "clean" intermediate
-- state and both advance the queue, skipping a singer's turn.
-- This wraps both steps in a single Postgres transaction with row locking so
-- concurrent calls serialize correctly instead of interleaving.

create or replace function public.advance_queue(p_room_code text)
returns table (stopped_count int, next_queue_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns boolean;
  v_stopped_count int;
  v_next_id bigint;
begin
  select exists(
    select 1 from rooms where code = p_room_code and owner_id = auth.uid()
  ) into v_owns;

  if not v_owns then
    raise exception 'CONTROL_ERROR: caller does not own this room';
  end if;

  with stopped as (
    update queue
      set status = 'history', is_playing = false
      where room_code = p_room_code and status = 'playing'
      returning id
  )
  select count(*) into v_stopped_count from stopped;

  select id into v_next_id
    from queue
    where room_code = p_room_code and status = 'queued'
    order by created_at asc, id asc
    limit 1
    for update skip locked;

  if v_next_id is not null then
    update queue
      set status = 'playing', is_playing = true, current_position_seconds = 0, last_sync_at = now()
      where id = v_next_id;
  end if;

  stopped_count := v_stopped_count;
  next_queue_id := v_next_id;
  return next;
end;
$$;

grant execute on function public.advance_queue(text) to authenticated;
