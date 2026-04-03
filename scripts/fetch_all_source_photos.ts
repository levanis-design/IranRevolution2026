/**
 * fetch_all_source_photos.ts
 *
 * For each memorial entry, tries to extract images from ALL source links
 * (Telegram, Instagram, X) and stores them in media.photos[].
 * The primary media.photo is kept as-is; photos[] is the full collection.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/fetch_all_source_photos.ts [--dry-run] [--limit N]
 */
import { createClient } from '@supabase/supabase-js'
import { extractSocialImage } from '../src/modules/imageExtractor.ts'
import { uploadImageToSupabase } from '../src/modules/supabase.ts'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
const dryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1]) : Infinity

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

function getSocialUrls(memorial: any): string[] {
  const media = memorial.media || {}
  const sources: { url?: string }[] = memorial.source_links || []
  const urls: string[] = []

  const candidates = [
    media.telegramPost,
    media.xPost,
    ...sources.map((s: { url?: string }) => s.url)
  ].filter(Boolean) as string[]

  for (const url of candidates) {
    if (
      url.includes('t.me/') ||
      url.includes('instagram.com') ||
      url.includes('x.com') ||
      url.includes('twitter.com')
    ) {
      if (!urls.includes(url)) urls.push(url)
    }
  }

  return urls
}

async function downloadImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { headers: { Referer: 'https://t.me/' }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

async function run() {
  console.log(`🖼️  Fetching multi-source photos${dryRun ? ' (DRY RUN)' : ''}...`)

  let all: any[] = [], page = 0, hasMore = true
  while (hasMore) {
    const { data, error } = await supabase
      .from('memorials')
      .select('id, name, media, source_links')
      .range(page * 1000, page * 1000 + 999)
    if (error) { console.error('Fetch error:', error.message); break }
    if (!data?.length) { hasMore = false; break }
    all = [...all, ...data]
    if (data.length < 1000) break
    page++
  }

  // Target: entries with 2+ social source URLs (potential for multiple images)
  const targets = all
    .filter(m => getSocialUrls(m).length >= 2)
    .slice(0, isFinite(limit) ? limit : undefined)

  console.log(`📊 Total: ${all.length} | With 2+ social sources: ${targets.length}`)

  let updated = 0, failed = 0

  // Chunk array processing
  const chunkSize = 5
  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize)

    await Promise.all(chunk.map(async (m) => {
      const urls = getSocialUrls(m)

      const photos: string[] = []
      const existingPhotos: string[] = (m.media?.photos as string[]) || (m.media?.photo ? [m.media.photo] : [])

      await Promise.all(urls.map(async (sourceUrl) => {
        try {
          const photoUrl = await extractSocialImage(sourceUrl)
          if (!photoUrl) return

          let stored = photoUrl
          if (!photoUrl.includes(supabaseUrl)) {
            const buf = await downloadImage(photoUrl)
            if (!buf) return
            const up = await uploadImageToSupabase(buf, photoUrl)
            if (!up) return
            stored = up
          }

          if (!photos.includes(stored) && !existingPhotos.includes(stored)) {
            photos.push(stored)
          }
        } catch {
          // skip this source
        }
      }))

      if (photos.length === 0) {
        console.log(`[${m.name}] ⏭️  no new images found (${urls.length} sources)`)
        return
      }

      const merged = [...existingPhotos, ...photos].filter((v, idx, a) => a.indexOf(v) === idx)

      if (dryRun) {
        console.log(`[${m.name}] ✅ would add ${photos.length} photo(s) → total ${merged.length}`)
        updated++
        return
      }

      const updatedMedia = {
        ...(m.media || {}),
        photo: merged[0],      // keep primary as first
        photos: merged
      }

      const { error } = await supabase.from('memorials').update({ media: updatedMedia }).eq('id', m.id)
      if (error) {
        console.log(`[${m.name}] ❌ update failed: ${error.message}`)
        failed++
      } else {
        console.log(`[${m.name}] ✅ ${photos.length} new photo(s) → total ${merged.length}`)
        updated++
      }
    }))

    // Add a small delay between chunks to avoid rate limiting
    await new Promise(r => setTimeout(r, 200))
  }

  console.log('\n--- Summary ---')
  console.log(`✅ Updated: ${updated}`)
  console.log(`❌ Failed:  ${failed}`)
}

run().catch(console.error)
