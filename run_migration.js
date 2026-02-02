const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const sql = `
    ALTER TABLE queue ADD COLUMN IF NOT EXISTS current_position_seconds INTEGER DEFAULT 0;
    ALTER TABLE queue ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    ALTER TABLE queue ADD COLUMN IF NOT EXISTS reset_trigger_count INTEGER DEFAULT 0;
  `;

  console.log("Running migration...");
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    if (error.message.includes("function \"exec_sql\" does not exist")) {
        console.error("RPC 'exec_sql' not enabled. Please run the SQL manually in Supabase SQL Editor:");
        console.log(sql);
    } else {
        console.error("Migration error:", error);
    }
  } else {
    console.log("Migration successful!");
  }
}

run();
