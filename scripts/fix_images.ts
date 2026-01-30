import { createClient } from '@supabase/supabase-js'
import { extractSocialImage } from '../src/modules/imageExtractor.ts'

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL must be set in .env')
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY (preferred) or VITE_SUPABASE_ANON_KEY must be set in .env')
  process.exit(1)
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  WARNING: Running with ANON key. Uploads may fail due to RLS policies.')
  console.warn('👉  Recommendation: Add SUPABASE_SERVICE_ROLE_KEY to your .env file for admin access.')
}

const supabase = createClient(supabaseUrl, supabaseKey)
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
  } else {
    console.log(`✅ Bucket ${BUCKET_NAME} exists.`)
  }
  return true
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(`Failed to fetch ${url}: ${response.statusText}`)
      return null
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    console.warn(`Error downloading ${url}:`, error)
    return null
  }
}

function getExtension(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname;
    const ext = pathname.split('.').pop();
    if (ext && ext.length < 5 && /^[a-z0-9]+$/i.test(ext)) {
        return ext.toLowerCase();
    }
    return 'jpg';
  } catch {
    return 'jpg';
  }
}

async function uploadImage(buffer: Buffer, originalUrl: string): Promise<string | null> {
  try {
    // Generate a unique filename
    const ext = getExtension(originalUrl);
    const filename = `${crypto.randomUUID()}.${ext}`
    
  const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, buffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: false
      })

    if (error) {
      console.error('Storage upload error:', error.message)
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

async function fixImages() {
  console.log('🔍 Checking for hotlinked and broken images...')
  
  if (!(await ensureBucket())) {
    console.error('❌ Cannot proceed without storage bucket.')
    return
  }
  
  // Fetch all records with pagination
  let allMemorials: any[] = []
  let page = 0
  const pageSize = 1000
  let hasMore = true

  console.log('📥 Fetching all memorials...')
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('memorials')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      console.error('Database error:', error.message)
      return
    }

    if (data && data.length > 0) {
      allMemorials = [...allMemorials, ...data]
      if (data.length < pageSize) {
        hasMore = false
      } else {
        page++
      }
    } else {
      hasMore = false
    }
  }
  
  const memorials = allMemorials
  console.log(`✅ Fetched ${memorials.length} records.`)

  let updatedCount = 0
  let failedCount = 0
  let skippedCount = 0

  for (const memorial of memorials) {
    const media = memorial.media || {}
    const photoUrl = media.photo

    // Check if photo URL is hotlinked (Telegram, Instagram, Twimg, etc.)
    // OR if it's a broken Supabase URL (contains '&' or is very long or has bad extension)
    const isSupabase = photoUrl && photoUrl.includes(supabaseUrl);
    const isBrokenSupabase = isSupabase && (
      photoUrl.includes('&') || 
      photoUrl.length > 200 || 
      photoUrl.includes('com&') || 
      photoUrl.includes('.com/') ||
      !/\.(jpg|jpeg|png|webp|gif|heic)$/i.test(photoUrl)
    );

    if (photoUrl && 
       ((photoUrl.includes('telegram.org') || 
        photoUrl.includes('instagram.com') || 
        photoUrl.includes('twimg.com') ||
        photoUrl.includes('ibb.co') ||
        photoUrl.includes('imgbb.com') ||
        photoUrl.includes('fbcdn.net')) && !isSupabase) || isBrokenSupabase) { 
      
      console.log(`Processing ${memorial.name}: ${isBrokenSupabase ? 'Broken Supabase URL' : 'Hotlinked URL'}`)
      
      let buffer = await downloadImage(photoUrl)
      
      // If download failed and it was a broken supabase url, we might need to fallback to re-extraction
      if (!buffer && isBrokenSupabase) {
         console.log(`Failed to download broken Supabase URL. Attempting re-extraction from source...`)
         const sourceUrl = media.xPost || media.telegramPost || 
                         (memorial.source_links && memorial.source_links.find((r: any) => r.url.includes('instagram.com'))?.url)
         if (sourceUrl) {
            console.log(`Re-extracting from: ${sourceUrl}`)
            const newExtractedUrl = await extractSocialImage(sourceUrl)
            if (newExtractedUrl && newExtractedUrl !== photoUrl) {
                buffer = await downloadImage(newExtractedUrl)
            }
         }
      }

      if (buffer) {
        // If we are fixing a broken Supabase URL, we should treat the originalUrl as just 'image.jpg' 
        // effectively, or try to guess extension, because the originalUrl is garbage.
        // The getExtension function will default to 'jpg' if it can't find a clean extension.
        
        const newUrl = await uploadImage(buffer, isBrokenSupabase ? 'image.jpg' : photoUrl)
        if (newUrl) {
          // Update the record
          const updatedMedia = { ...media, photo: newUrl }
          const { error: updateError } = await supabase
            .from('memorials')
            .update({ media: updatedMedia })
            .eq('id', memorial.id)

          if (updateError) {
            console.error(`Failed to update record ${memorial.id}:`, updateError.message)
            failedCount++
          } else {
            console.log(`✅ Updated ${memorial.name} -> ${newUrl}`)
            updatedCount++
          }
        } else {
          console.warn(`Skipping ${memorial.name}: Upload failed`)
          failedCount++
        }
      } else {
        // If primary download failed, try fallback extraction
        // We do this even if it was a broken supabase URL, because if we can't download it, we need to find the original source.
        console.log(`Download failed. Attempting fallback extraction...`)
        const sourceUrl = media.xPost || media.telegramPost || 
                        (memorial.source_links && memorial.source_links.find((r: any) => r.url.includes('instagram.com'))?.url)
        
        if (sourceUrl) {
            console.log(`Re-extracting from: ${sourceUrl}`)
            // Add a small delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const newExtractedUrl = await extractSocialImage(sourceUrl)
            if (newExtractedUrl && newExtractedUrl !== photoUrl) {
                 const newBuffer = await downloadImage(newExtractedUrl)
                 if (newBuffer) {
                     const newUrl = await uploadImage(newBuffer, newExtractedUrl)
                     if (newUrl) {
                        const updatedMedia = { ...media, photo: newUrl }
                        await supabase.from('memorials').update({ media: updatedMedia }).eq('id', memorial.id)
                        console.log(`✅ Updated ${memorial.name} (via fallback) -> ${newUrl}`)
                        updatedCount++
                        continue;
                     }
                 }
            }
        }
        
        console.warn(`Skipping ${memorial.name}: Download failed and fallback failed`)
        failedCount++
      }
    } else {
      skippedCount++
    }
  }

  console.log('--- Summary ---')
  console.log(`Updated: ${updatedCount}`)
  console.log(`Failed: ${failedCount}`)
  console.log(`Skipped: ${skippedCount}`)
}

fixImages().catch(console.error)
