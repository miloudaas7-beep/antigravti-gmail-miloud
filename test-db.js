const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('campaign_leads')
    .select('id, lead_id, status, scheduled_at, sent_at, error_message')
    .order('id', { ascending: false })
    .limit(5);
    
  if (error) {
    console.error("DB Error:", error);
  } else {
    console.log("Last 5 Campaign Leads:", JSON.stringify(data, null, 2));
  }
}

check();
