const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'packages/config/.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing URL or KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('chat_conversations').select('*').limit(1);
  console.log("Select Error:", error?.message || 'Success', data);

  const { data: insertData, error: insertError } = await supabase.from('chat_conversations').insert({
    organization_id: 'd0000000-0000-0000-0000-000000000000',
    title: 'Test'
  });
  console.log("Insert Error:", insertError?.message || 'Success', insertData);
}

test();
