const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');

const getEnv = (key) => {
  const match = env.match(new RegExp(`${key}=(.*)`));
  return match ? match[1].trim() : null;
};

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('campaign_leads')
    .select('*, campaign:campaign_id(id, created_at, name)')
    .order('id', { ascending: false })
    .limit(5);
    
  if (error) {
    console.error("DB Error:", error);
  } else {
    console.log("Last 5 leads with campaign info:", JSON.stringify(data, null, 2));
  }
}

check();
