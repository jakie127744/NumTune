-- 1. Add Room Code support to the queue
ALTER TABLE queue ADD COLUMN IF NOT EXISTS room_code TEXT DEFAULT 'A94B';

-- 2. Ensure sync columns are active (re-running for safety)
ALTER TABLE queue ADD COLUMN IF NOT EXISTS current_position_seconds INTEGER DEFAULT 0;
ALTER TABLE queue ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE queue ADD COLUMN IF NOT EXISTS reset_trigger_count INTEGER DEFAULT 0;

-- 3. Create an index for room-based lookups to keep performance high
CREATE INDEX IF NOT EXISTS idx_queue_room_code ON queue(room_code) WHERE status = 'playing';

-- 4. Update the 'playing' row to have the default room code if it exists
UPDATE queue SET room_code = 'A94B' WHERE status = 'playing' AND room_code IS NULL;
