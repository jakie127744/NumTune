const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const migrationFile = path.join(__dirname, 'migration_security_rls.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log("Running migration...");
  
  // Try to use a PG client if RPC fails, but for now assuming RPC exec_sql exists 
  // (as per previous usage in this codebase, assuming user set it up)
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
