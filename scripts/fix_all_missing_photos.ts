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

function getSocialUrl(memorial: any): string | null {
  const media = memorial.media || {}
  const sources: { url?: string }[] = memorial.source_links || []

  // Priority: Telegram > Instagram > X
  if (media.telegramPost) return media.telegramPost

  const tgSource = sources.find(r => r.url?.includes('t.me/'))
  if (tgSource?.url) return tgSource.url

  const igSource = sources.find(r => r.url?.includes('instagram.com'))
  if (igSource?.url) return igSource.url

  if (media.xPost) return media.xPost

  return null
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
    return getSocialUrl(m) !== null
  })

  console.log(`📊 Total: ${all.length} | No photo: ${all.filter(m => !m.media?.photo).length} | Actionable: ${targets.length}`)
  if (dryRun) {
    for (const m of targets.slice(0, 20)) {
      console.log(`  [DRY RUN] ${m.name} → ${getSocialUrl(m)}`)
    }
    if (targets.length > 20) console.log(`  ... and ${targets.length - 20} more`)
    return
  }

  let updated = 0, failed = 0
  for (let i = 0; i < targets.length; i++) {
    const m = targets[i]
    const sourceUrl = getSocialUrl(m)!
    process.stdout.write(`[${i + 1}/${targets.length}] ${m.name} ... `)

    try {
      const photoUrl = await extractSocialImage(sourceUrl)
      if (!photoUrl) { console.log('❌ no image extracted'); failed++; continue }

      // If already a Supabase URL (Telegram cached), use directly
      if (supabaseUrl && photoUrl.includes(supabaseUrl)) {
        const updatedMedia = { ...(m.media || {}), photo: photoUrl }
        const { error } = await supabase.from('memorials').update({ media: updatedMedia }).eq('id', m.id)
        if (error) { console.log(`❌ update failed: ${error.message}`); failed++ }
        else { console.log(`✅ (cached) ${photoUrl.split('/').pop()}`); updated++ }
        continue
      }

      const buffer = await downloadImage(photoUrl)
      if (!buffer) { console.log('❌ download failed'); failed++; continue }

      const storedUrl = await uploadImageToSupabase(buffer, photoUrl)
      if (!storedUrl) { console.log('❌ upload failed'); failed++; continue }

      const updatedMedia = { ...(m.media || {}), photo: storedUrl }
      const { error } = await supabase.from('memorials').update({ media: updatedMedia }).eq('id', m.id)
      if (error) { console.log(`❌ update failed: ${error.message}`); failed++ }
      else { console.log(`✅ ${storedUrl.split('/').pop()}`); updated++ }

    } catch (e) {
      console.log(`❌ error: ${e instanceof Error ? e.message : e}`)
      failed++
    }

    await new Promise(r => setTimeout(r, 300))
  }

  console.log('\n--- Summary ---')
  console.log(`✅ Updated: ${updated}`)
  console.log(`❌ Failed:  ${failed}`)
  console.log(`⏭️  No source: ${all.filter(m => !m.media?.photo && !getSocialUrl(m)).length}`)
}

run().catch(console.error)
