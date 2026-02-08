import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'
import { randomUUID } from 'node:crypto'

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) must be set in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
})
const BUCKET_NAME = 'memorial-images'

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) {
    console.error('Error listing buckets:', error.message)
    return false
  }
  
  const bucket = buckets.find(b => b.name === BUCKET_NAME)
  if (!bucket) {
    console.log(`Bucket ${BUCKET_NAME} not found. Attempting to create...`)
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true
    })
    if (createError) {
      console.error('Error creating bucket:', createError.message)
      return false
    }
    console.log(`✅ Bucket ${BUCKET_NAME} created.`)
  }
  return true
}

async function scrapeTelegramImage(postUrl: string): Promise<string | null> {
  try {
    console.log(`Scraping Telegram post: ${postUrl}`)
    const response = await fetch(postUrl)
    if (!response.ok) {
      console.warn(`Failed to fetch Telegram post ${postUrl}: ${response.statusText}`)
      return null
    }
    const html = await response.text()
    
    // Try to find og:image
    const ogImageMatch = html.match(/<meta property="og:image" content="(https:\/\/cdn\d+\.telesco\.pe\/file\/[^"]+)"/)
    if (ogImageMatch && ogImageMatch[1]) {
      return ogImageMatch[1]
    }
    
    // Fallback: look for any telesco.pe link in the HTML
    const telescoMatch = html.match(/https:\/\/cdn\d+\.telesco\.pe\/file\/[^"'\s)]+/)
    if (telescoMatch) {
      return telescoMatch[0]
    }
    
    return null
  } catch (error) {
    console.error(`Error scraping Telegram post ${postUrl}:`, error)
    return null
  }
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    // Try downloading with Referer header to bypass some protections
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://t.me/'
      }
    })
    if (!response.ok) {
      console.warn(`Failed to download image from ${url}: ${response.statusText}`)
      return null
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    console.warn(`Error downloading image from ${url}:`, error)
    return null
  }
}

async function uploadToSupabase(buffer: Buffer, originalUrl: string): Promise<string | null> {
  try {
    const ext = originalUrl.split('.').pop()?.split('?')[0] || 'jpg'
    const filename = `${randomUUID()}.${ext}`
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, buffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: false
      })

    if (error) {
      console.error('Supabase upload error:', error.message)
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filename)

    return publicUrl
  } catch (error) {
    console.error('Upload exception:', error)
    return null
  }
}

async function fixTelegramImages() {
  console.log('🚀 Starting Telegram image fix...')
  
  if (!(await ensureBucket())) {
    console.error('❌ Cannot proceed without storage bucket.')
    return
  }
  
  // Fetch records that have Telegram links or broken telesco.pe links
  const { data: memorials, error } = await supabase
    .from('memorials')
    .select('*')
    .or('media->>photo.ilike.%telesco.pe%,media->>telegramPost.neq.null')

  if (error) {
    console.error('Error fetching memorials:', error.message)
    return
  }

  console.log(`Found ${memorials.length} potential records to fix.`)

  let successCount = 0
  let failedCount = 0

  for (const memorial of memorials) {
    const photoUrl = memorial.media?.photo
    const telegramPost = memorial.media?.telegramPost || (memorial.references && memorial.references.find((r: any) => r.url.includes('t.me/'))?.url)

    // Skip if already a Supabase URL and not broken (though we might want to refresh telesco.pe ones)
    if (photoUrl && photoUrl.includes(supabaseUrl) && !photoUrl.includes('telesco.pe')) {
      continue
    }

    if (!telegramPost) {
      if (photoUrl && photoUrl.includes('telesco.pe')) {
        console.log(`Processing ${memorial.name}: No Telegram post but has telesco.pe URL. Attempting direct download...`)
        const buffer = await downloadImage(photoUrl)
        if (buffer) {
          const uploadedImageUrl = await uploadToSupabase(buffer, photoUrl)
          if (uploadedImageUrl) {
            const updatedMedia = { ...memorial.media, photo: uploadedImageUrl }
            await supabase.from('memorials').update({ media: updatedMedia }).eq('id', memorial.id)
            console.log(`✅ Fixed image for ${memorial.name} via direct download`)
            successCount++
            continue
          }
        }
      }
      console.log(`Skipping ${memorial.name}: No Telegram post URL found and direct download failed.`)
      continue
    }

    console.log(`Processing ${memorial.name}...`)
    
    const freshImageUrl = await scrapeTelegramImage(telegramPost)
    if (!freshImageUrl) {
      console.warn(`Could not find fresh image for ${memorial.name} from ${telegramPost}`)
      failedCount++
      continue
    }

    const buffer = await downloadImage(freshImageUrl)
    if (!buffer) {
      console.warn(`Could not download image for ${memorial.name} from ${freshImageUrl}`)
      failedCount++
      continue
    }

    const uploadedImageUrl = await uploadToSupabase(buffer, freshImageUrl)
    if (!uploadedImageUrl) {
      console.warn(`Could not upload image for ${memorial.name} to Supabase`)
      failedCount++
      continue
    }

    // Update the record
    const updatedMedia = { ...memorial.media, photo: uploadedImageUrl }
    const { error: updateError } = await supabase
      .from('memorials')
      .update({ media: updatedMedia })
      .eq('id', memorial.id)

    if (updateError) {
      console.error(`Error updating memorial ${memorial.name}:`, updateError.message)
      failedCount++
    } else {
      console.log(`✅ Fixed image for ${memorial.name}`)
      successCount++
    }
  }

  console.log('--- Fix Completed ---')
  console.log(`Successfully fixed: ${successCount}`)
  console.log(`Failed: ${failedCount}`)
}

fixTelegramImages().catch(console.error)
