/**
 * purge_channel_avatars.ts
 *
 * The RememberTheirNames Telegram channel avatar was mistakenly extracted
 * as the photo for text-only posts. This script:
 * 1. Finds all entries with a Telegram source but NO actual post photo
 *    (by re-checking the Telegram page for photo widgets)
 * 2. Clears media.photo from those entries so they show "No Photo" cleanly
 *
 * Dry-run mode: --dry-run
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
const dryRun = process.argv.includes('--dry-run')

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

async function telegramPostHasPhoto(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('tgme_widget_message_photo') ||
           html.includes('tgme_widget_message_video') ||
           html.includes('message_media_photo')
  } catch {
    return false
  }
}

async function run() {
  console.log(`🔍 Finding entries with photos from Telegram text-only posts${dryRun ? ' (DRY RUN)' : ''}...`)

  // Fetch all entries that have a photo AND a telegramPost source
  let all: any[] = [], page = 0, hasMore = true
  while (hasMore) {
    const { data, error } = await supabase
      .from('memorials')
      .select('id, name, media, source_links')
      .not('media->photo', 'is', null)
      .range(page * 1000, page * 1000 + 999)
    if (error) { console.error('Fetch error:', error.message); break }
    if (!data?.length) { hasMore = false; break }
    all = [...all, ...data]
    if (data.length < 1000) break
    page++
  }

  // Filter to entries that have a Telegram URL as their source
  const withTelegram = all.filter(m => {
    const media = m.media || {}
    const sources: { url?: string }[] = m.source_links || []
    return media.telegramPost?.includes('t.me/') ||
           sources.some((s: { url?: string }) => s.url?.includes('t.me/'))
  })

  console.log(`📊 Total with photo: ${all.length} | With Telegram source: ${withTelegram.length}`)

  if (withTelegram.length === 0) {
    console.log('✅ No entries with Telegram photos to check.')
    return
  }

  let cleared = 0, kept = 0, errors = 0
  const CHUNK_SIZE = 5

  for (let i = 0; i < withTelegram.length; i += CHUNK_SIZE) {
    const chunk = withTelegram.slice(i, i + CHUNK_SIZE)

    // Process a chunk concurrently
    const results = await Promise.all(chunk.map(async (m, chunkIdx) => {
      const media = m.media || {}
      const sources: { url?: string }[] = m.source_links || []
      const tgUrl = media.telegramPost || sources.find((s: { url?: string }) => s.url?.includes('t.me/'))?.url

      if (!tgUrl) return { m, hasPhoto: null, tgUrl, chunkIdx }

      const hasPhoto = await telegramPostHasPhoto(tgUrl)
      return { m, hasPhoto, tgUrl, chunkIdx }
    }))

    // Execute database updates concurrently for this chunk
    const dbTasks = results.map(async ({ m, hasPhoto, tgUrl, chunkIdx }) => {
      if (!tgUrl) return { action: 'kept' }

      const idx = i + chunkIdx
      const msgPrefix = `[${idx + 1}/${withTelegram.length}] ${m.name}`

      if (hasPhoto) {
        console.log(`${msgPrefix} ... ✅ has real photo, keeping`)
        return { action: 'kept' }
      } else {
        console.log(`${msgPrefix} ... 🗑️  text-only post — clearing photo${dryRun ? ' (dry run)' : ''}`)
        if (!dryRun) {
          const updatedMedia = { ...m.media }
          delete updatedMedia.photo
          const { error } = await supabase.from('memorials').update({ media: updatedMedia }).eq('id', m.id)
          if (error) {
            console.error(`  ❌ update failed: ${error.message}`)
            return { action: 'error' }
          }
        }
        return { action: 'cleared' }
      }
    })

    const dbResults = await Promise.all(dbTasks)
    for (const res of dbResults) {
      if (res.action === 'kept') kept++
      else if (res.action === 'cleared') cleared++
      else if (res.action === 'error') errors++
    }

    // Be polite to Telegram servers between chunks
    if (i + CHUNK_SIZE < withTelegram.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  console.log('\n--- Summary ---')
  console.log(`🗑️  Cleared: ${cleared}`)
  console.log(`✅ Kept:    ${kept}`)
  console.log(`❌ Errors:  ${errors}`)
}

run().catch(console.error)
