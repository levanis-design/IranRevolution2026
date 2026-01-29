
import { createClient } from '@supabase/supabase-js'
import { extractSocialImage } from '../src/modules/imageExtractor.ts'
import FormData from 'form-data'
import fetch from 'node-fetch'

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const IMGBB_API_KEY = process.env.imgbb_api_key

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_ANON_KEY must be set in .env')
  process.exit(1)
}

if (!IMGBB_API_KEY) {
  console.error('Error: imgbb_api_key must be set in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

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

async function uploadToImgBB(buffer: Buffer, name: string): Promise<string | null> {
  try {
    const formData = new FormData()
    formData.append('key', IMGBB_API_KEY)
    formData.append('image', buffer.toString('base64'))
    formData.append('name', name)

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    })

    const result = await response.json()
    
    if (result.success) {
      return result.data.url
    } else {
      console.error('ImgBB upload error:', result.error?.message || 'Unknown error')
      return null
    }
  } catch (error) {
    console.error('ImgBB upload exception:', error)
    return null
  }
}

async function migrateToImgBB() {
  console.log('Starting migration to ImgBB...')
  
  let page = 0
  const pageSize = 50 // Smaller batch size to respect API rate limits
  let hasMore = true
  let updatedCount = 0
  let skippedCount = 0
  let failedCount = 0

  while (hasMore) {
    const { data: memorials, error } = await supabase
      .from('memorials')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching data:', error)
      break
    }

    if (!memorials || memorials.length === 0) {
      hasMore = false
      break
    }

    console.log(`Processing batch ${page + 1} (${memorials.length} records)...`)

    for (const memorial of memorials) {
      const media = memorial.media || {}
      const photoUrl = media.photo

      // Check if it's already an ImgBB URL
      if (photoUrl && (photoUrl.includes('ibb.co') || photoUrl.includes('imgbb.com'))) {
        skippedCount++
        continue
      }

      // Determine source URL
      let sourceUrl = photoUrl
      let needsExtraction = false

      // If no photo URL, or it's a social link that's likely broken/hotlinked
      if (!sourceUrl || sourceUrl.includes('twitter.com') || sourceUrl.includes('x.com') || sourceUrl.includes('instagram.com') || sourceUrl.includes('t.me')) {
         // If we have a direct social link in media.photo, try to use it, but usually we want to re-extract
         // If media.photo is missing, try to find a source link
         if (!sourceUrl) {
             sourceUrl = media.xPost || media.telegramPost || 
                        (memorial.source_links && memorial.source_links.find((r: any) => r.url.includes('instagram.com'))?.url)
             needsExtraction = true
         }
      }

      // If it is a Supabase URL, we want to migrate it
      const isSupabase = sourceUrl && sourceUrl.includes('supabase.co')

      if (!sourceUrl) {
        skippedCount++
        continue
      }

      console.log(`Processing ${memorial.name}: ${sourceUrl}`)

      let buffer: Buffer | null = null

      // 1. Try to download directly if it's a file URL (Supabase or other CDN)
      if (!needsExtraction) {
        buffer = await downloadImage(sourceUrl)
      }

      // 2. If direct download failed or we know we need extraction (social links)
      if (!buffer) {
        console.log(`Direct download failed or not applicable. Attempting extraction...`)
        // If it was a Supabase URL that failed, it might be broken, so try to find original source
        if (isSupabase) {
             const originalSource = media.xPost || media.telegramPost || 
                        (memorial.source_links && memorial.source_links.find((r: any) => r.url.includes('instagram.com'))?.url)
             if (originalSource) {
                 sourceUrl = originalSource
                 console.log(`Falling back to original source: ${sourceUrl}`)
                 const extractedUrl = await extractSocialImage(sourceUrl)
                 if (extractedUrl) {
                     buffer = await downloadImage(extractedUrl)
                 }
             }
        } else {
             // It's a social link
             const extractedUrl = await extractSocialImage(sourceUrl)
             if (extractedUrl) {
                 buffer = await downloadImage(extractedUrl)
             }
        }
      }

      if (buffer) {
        // Upload to ImgBB
        const newUrl = await uploadToImgBB(buffer, `${memorial.id}-${memorial.name}`)
        
        if (newUrl) {
            const updatedMedia = { ...media, photo: newUrl }
            const { error: updateError } = await supabase
                .from('memorials')
                .update({ media: updatedMedia })
                .eq('id', memorial.id)

            if (updateError) {
                console.error(`Failed to update DB for ${memorial.name}:`, updateError.message)
                failedCount++
            } else {
                console.log(`✅ Migrated ${memorial.name} -> ${newUrl}`)
                updatedCount++
            }
        } else {
            console.error(`Failed to upload to ImgBB for ${memorial.name}`)
            failedCount++
        }
      } else {
        console.warn(`Could not retrieve image for ${memorial.name}`)
        failedCount++
      }
      
      // Rate limiting: sleep a bit
      await new Promise(r => setTimeout(r, 500))
    }

    if (memorials.length < pageSize) {
      hasMore = false
    } else {
      page++
    }
  }

  console.log('--- Migration Summary ---')
  console.log(`Migrated: ${updatedCount}`)
  console.log(`Skipped (already ImgBB or no source): ${skippedCount}`)
  console.log(`Failed: ${failedCount}`)
}

migrateToImgBB().catch(console.error)
