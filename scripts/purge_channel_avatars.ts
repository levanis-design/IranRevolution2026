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

  let cleared = 0, kept = 0, errors = 0

  for (let i = 0; i < withTelegram.length; i++) {
    const m = withTelegram[i]
    const media = m.media || {}
    const sources: { url?: string }[] = m.source_links || []
    const tgUrl = media.telegramPost || sources.find((s: { url?: string }) => s.url?.includes('t.me/'))?.url

    if (!tgUrl) { kept++; continue }

    process.stdout.write(`[${i + 1}/${withTelegram.length}] ${m.name} ... `)

    const hasPhoto = await telegramPostHasPhoto(tgUrl)
    if (hasPhoto) {
      console.log('✅ has real photo, keeping')
      kept++
    } else {
      console.log(`🗑️  text-only post — clearing photo${dryRun ? ' (dry run)' : ''}`)
      if (!dryRun) {
        const updatedMedia = { ...media }
        delete updatedMedia.photo
        const { error } = await supabase.from('memorials').update({ media: updatedMedia }).eq('id', m.id)
        if (error) { console.error('  ❌ update failed:', error.message); errors++ }
        else cleared++
      } else {
        cleared++
      }
    }

    // Be polite to Telegram servers
    await new Promise(r => setTimeout(r, 200))
  }

  console.log('\n--- Summary ---')
  console.log(`🗑️  Cleared: ${cleared}`)
  console.log(`✅ Kept:    ${kept}`)
  console.log(`❌ Errors:  ${errors}`)
}

run().catch(console.error)
