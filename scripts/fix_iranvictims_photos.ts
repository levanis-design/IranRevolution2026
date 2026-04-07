/**
 * fix_iranvictims_photos.ts
 *
 * For memorials missing a photo that have an iranvictims.com/card/NNNN source link,
 * fetches photos via the iranvictims.com JSON API and uploads the first one to Supabase.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/fix_iranvictims_photos.ts [--dry-run] [--limit N]
 */
import { createClient } from '@supabase/supabase-js'
import { uploadImageToSupabase } from '../src/modules/supabase.ts'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
const dryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1]) : Infinity

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

function getIranVictimsId(memorial: any): string | null {
  const sources: { url?: string }[] = memorial.source_links || []
  for (const s of sources) {
    const m = s.url?.match(/iranvictims\.com\/card\/(\d+)/)
    if (m) return m[1]
  }
  return null
}

async function fetchIranVictimsPhotos(cardId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://iranvictims.com/api/card/${cardId}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.photos) ? data.photos.filter(Boolean) : []
  } catch {
    return []
  }
}

async function downloadImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

async function run() {
  console.log(`🔍 Fetching memorials without photos...${dryRun ? ' (DRY RUN)' : ''}`)

  let all: any[] = []
  let page = 0
  let hasMore = true
  while (hasMore) {
    const { data, error } = await supabase
      .from('memorials')
      .select('id,name,media,source_links')
      .range(page * 1000, page * 1000 + 999)
    if (error) { console.error('Fetch error:', error.message); break }
    if (!data?.length) break
    all = [...all, ...data]
    if (data.length < 1000) break
    page++
  }

  const targets = all
    .filter(m => !m.media?.photo && getIranVictimsId(m) !== null)
    .slice(0, limit)

  console.log(`📊 Total: ${all.length} | No photo: ${all.filter(m => !m.media?.photo).length} | iranvictims.com actionable: ${targets.length}`)

  if (dryRun) {
    for (const m of targets.slice(0, 20)) {
      const id = getIranVictimsId(m)
      console.log(`  [DRY RUN] ${m.name} → iranvictims.com/card/${id}`)
    }
    if (targets.length > 20) console.log(`  ... and ${targets.length - 20} more`)
    return
  }

  let updated = 0, failed = 0, noPhotos = 0
  const CONCURRENCY = 8

  async function processOne(m: any, index: number) {
    const cardId = getIranVictimsId(m)!
    process.stdout.write(`[${index + 1}/${targets.length}] ${m.name} (card/${cardId}) ... `)

    const photos = await fetchIranVictimsPhotos(cardId)
    if (!photos.length) {
      console.log('⚪ no photos in API')
      noPhotos++
      return
    }

    // Try photos in order until one uploads successfully
    for (const photoUrl of photos) {
      const buffer = await downloadImage(photoUrl)
      if (!buffer) continue

      const storedUrl = await uploadImageToSupabase(buffer, photoUrl)
      if (!storedUrl) continue

      const updatedMedia = { ...(m.media || {}), photo: storedUrl }
      const { error } = await supabase.from('memorials').update({ media: updatedMedia }).eq('id', m.id)
      if (error) {
        console.log(`❌ update failed: ${error.message}`)
        failed++
      } else {
        console.log(`✅ ${storedUrl.split('/').pop()}`)
        updated++
      }
      return
    }

    console.log('❌ all photos failed to download/upload')
    failed++
  }

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map((m, j) => processOne(m, i + j)))
    await new Promise(r => setTimeout(r, 200))
  }

  console.log('\n--- Summary ---')
  console.log(`✅ Updated:  ${updated}`)
  console.log(`❌ Failed:   ${failed}`)
  console.log(`⚪ No photos in API: ${noPhotos}`)
}

run().catch(console.error)
