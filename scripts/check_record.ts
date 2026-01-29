
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) process.exit(1)

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkRecord() {
  const { data, error } = await supabase
    .from('memorials')
    .select('*')
    .ilike('name', '%Reza Karimifar%')
  
  if (error) {
    console.error(error)
    return
  }

  console.log(JSON.stringify(data, null, 2))
}

checkRecord()
