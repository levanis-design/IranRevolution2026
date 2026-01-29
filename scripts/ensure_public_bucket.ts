
import { createClient } from '@supabase/supabase-js'

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Env vars missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const BUCKET_NAME = 'memorial-images'

async function checkAndFixBucket() {
  console.log('🔍 Checking bucket configuration...')

  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) {
    console.error('Error listing buckets:', error.message)
    return
  }

  const bucket = buckets.find(b => b.name === BUCKET_NAME)
  if (!bucket) {
    console.error(`❌ Bucket ${BUCKET_NAME} does not exist!`)
    return
  }

  console.log(`Bucket found:`, bucket)

  if (!bucket.public) {
    console.log(`⚠️ Bucket is PRIVATE. Updating to PUBLIC...`)
    const { error: updateError } = await supabase.storage.updateBucket(BUCKET_NAME, {
      public: true
    })
    
    if (updateError) {
      console.error('Failed to update bucket:', updateError.message)
    } else {
      console.log('✅ Bucket updated to PUBLIC.')
    }
  } else {
    console.log('✅ Bucket is already PUBLIC.')
  }

  // Test an image
  // Using the URL from the previous successful run for Farhad Nazari Goorajooyi
  const testUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/03e09815-cda9-4feb-8292-f00e8639353d.jpg`
  console.log(`\nTesting access to: ${testUrl}`)
  
  try {
    const response = await fetch(testUrl, { method: 'HEAD' })
    console.log(`Status: ${response.status} ${response.statusText}`)
    
    if (response.ok) {
        console.log('✅ Image is accessible!')
    } else {
        console.error('❌ Image is NOT accessible.')
        console.log('Possible reasons:')
        console.log('1. RLS policies might be blocking SELECT access.')
        console.log('2. The file might not exist (if the previous script run failed differently).')
    }
  } catch (e) {
    console.error('Fetch error:', e)
  }
}

checkAndFixBucket()
