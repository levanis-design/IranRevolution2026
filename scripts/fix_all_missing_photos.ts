/**
 * fix_all_missing_photos.ts
 *
 * Finds all memorials with no photo and attempts to extract + upload one.
 * Checks both media.* fields AND source_links for social media URLs.
 * Paginates properly through all records.
 */
import { createClient } from '@supabase/supabase-js'
import { extractSocialImage } from '../src/modules/imageExtractor.ts'
import { uploadImageToSupabase } from '../src/modules/supabase.ts'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const dryRun = process.argv.includes('--dry-run')

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL and service role key in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

function isImageSourceUrl(url: string | undefined): boolean {
  if (!url) return false
  return url.includes('t.me/') ||
    url.includes('instagram.com') ||
    url.includes('x.com') ||
    url.includes('twitter.com') ||
    url.includes('hengaw.net') ||
    url.includes('wikipedia.org')
}

function getSocialUrls(memorial: any): string[] {
  const media = memorial.media || {}
  const sources: { url?: string }[] = memorial.source_links || []
  const ordered: string[] = []

  const pushUnique = (url: string | undefined) => {
    if (!url || !isImageSourceUrl(url) || ordered.includes(url)) return
    ordered.push(url)
  }

  pushUnique(media.telegramPost)
  for (const source of sources) {
    if (source.url?.includes('t.me/')) pushUnique(source.url)
  }

  for (const source of sources) {
    if (source.url?.includes('instagram.com')) pushUnique(source.url)
  }

  pushUnique(media.xPost)
  for (const source of sources) {
    if (source.url?.includes('x.com') || source.url?.includes('twitter.com')) pushUnique(source.url)
  }

  return ordered
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { 'Referer': 'https://t.me/' } })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

async function run() {
  console.log(`🔍 Fetching all memorials${dryRun ? ' (DRY RUN)' : ''}...`)

  let all: any[] = [], page = 0, hasMore = true
  while (hasMore) {
    const { data, error } = await supabase
      .from('memorials')
      .select('id,name,media,source_links')
      .range(page * 1000, page * 1000 + 999)
    if (error) { console.error('Fetch error:', error.message); hasMore = false; break }
    if (!data?.length) { hasMore = false; break }
    all = [...all, ...data]
    if (data.length < 1000) break
    page++
  }

  const targets = all.filter(m => {
    if (m.media?.photo) return false
    return getSocialUrls(m).length > 0
  })

  console.log(`📊 Total: ${all.length} | No photo: ${all.filter(m => !m.media?.photo).length} | Actionable: ${targets.length}`)
  if (dryRun) {
    for (const m of targets.slice(0, 20)) {
      console.log(`  [DRY RUN] ${m.name} → ${getSocialUrls(m).join(' | ')}`)
    }
    if (targets.length > 20) console.log(`  ... and ${targets.length - 20} more`)
    return
  }

  let updated = 0, failed = 0
  const CONCURRENCY = 5

  async function processMemorial(m: any, index: number) {
    const sourceUrls = getSocialUrls(m)
    process.stdout.write(`[${index + 1}/${targets.length}] ${m.name} ... `)

    try {
      let photoUrl: string | null = null
      for (const sourceUrl of sourceUrls) {
        photoUrl = await extractSocialImage(sourceUrl)
        if (photoUrl) break
      }
      if (!photoUrl) {
        console.log('❌ no image extracted')
        failed++
        return
      }

      if (supabaseUrl && photoUrl.includes(supabaseUrl)) {
        const updatedMedia = { ...(m.media || {}), photo: photoUrl }
        const { error } = await supabase.from('memorials').update({ media: updatedMedia }).eq('id', m.id)
        if (error) {
          console.log(`❌ update failed: ${error.message}`)
          failed++
        } else {
          console.log(`✅ (cached) ${photoUrl.split('/').pop()}`)
          updated++
        }
        return
      }

      const buffer = await downloadImage(photoUrl)
      if (!buffer) {
        console.log('❌ download failed')
        failed++
        return
      }

      const storedUrl = await uploadImageToSupabase(buffer, photoUrl)
      if (!storedUrl) {
        console.log('❌ upload failed')
        failed++
        return
      }

      const updatedMedia = { ...(m.media || {}), photo: storedUrl }
      const { error } = await supabase.from('memorials').update({ media: updatedMedia }).eq('id', m.id)
      if (error) {
        console.log(`❌ update failed: ${error.message}`)
        failed++
      } else {
        console.log(`✅ ${storedUrl.split('/').pop()}`)
        updated++
      }
    } catch (e) {
      console.log(`❌ error: ${e instanceof Error ? e.message : e}`)
      failed++
    }
  }

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map((m, batchIndex) => processMemorial(m, i + batchIndex)))
    await new Promise(r => setTimeout(r, 300))
  }

  console.log('\n--- Summary ---')
  console.log(`✅ Updated: ${updated}`)
  console.log(`❌ Failed:  ${failed}`)
  console.log(`⏭️  No source: ${all.filter(m => !m.media?.photo && getSocialUrls(m).length === 0).length}`)
}

run().catch(console.error)
