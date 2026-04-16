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

async function testInsert() {
  const fakeDate = new Date();
  fakeDate.setDate(fakeDate.getDate() + 1); // tomorrow
  
  const payload = {
    campaign_id: '18abfeef-94f9-47da-9717-a1376e208222', 
    lead_id: '7e5ead87-a7c6-4478-be88-fab81844ddbd',
    user_id: '3aaf5171-cd82-4a54-87d4-2975589d5ed0',
    status: 'pending',
    scheduled_at: fakeDate.toISOString()
  };

  console.log("Attempting to insert:", payload);

  const { data, error } = await supabase
    .from('campaign_leads')
    .insert([payload])
    .select();
    
  if (error) {
    console.error("DB Error:", error);
  } else {
    console.log("Success! Inserted row:", data);
  }
}

testInsert();
