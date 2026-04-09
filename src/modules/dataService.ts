import { supabase, supabaseAdmin, cacheImageFromUrl, isSupabaseStorageUrl } from './supabase'
import { extractSocialImage } from './imageExtractor'
import { translateMemorialData, geocodeLocation, reverseGeocode } from './ai'
import { logger } from './logger'
import type { MemorialEntry } from './types'
import type { Database } from './database.types'

type MemorialRow = Database['public']['Tables']['memorials']['Row']
type MemorialInsert = Database['public']['Tables']['memorials']['Insert']
type MemorialUpdate = Database['public']['Tables']['memorials']['Update']
export type ReportRow = Database['public']['Tables']['reports']['Row']
type ReportInsert = Database['public']['Tables']['reports']['Insert']
type ReferenceLink = { label: string; url: string }

function isImageSourceUrl(url: string | undefined): boolean {
  if (!url) return false
  return url.includes('t.me/') ||
    url.includes('instagram.com') ||
    url.includes('x.com') ||
    url.includes('twitter.com') ||
    url.includes('hengaw.net') ||
    url.includes('wikipedia.org')
}

function getCandidateImageSourceUrls(
  media: { xPost?: string; telegramPost?: string } | null | undefined,
  refs: ReferenceLink[] | null | undefined
): string[] {
  const ordered: string[] = []
  const pushUnique = (url: string | undefined) => {
    if (!url || !isImageSourceUrl(url) || ordered.includes(url)) return
    ordered.push(url)
  }

  pushUnique(media?.telegramPost)

  for (const ref of refs || []) {
    if (ref.url?.includes('t.me/')) pushUnique(ref.url)
  }

  for (const ref of refs || []) {
    if (ref.url?.includes('instagram.com')) pushUnique(ref.url)
  }

  pushUnique(media?.xPost)

  for (const ref of refs || []) {
    if (ref.url?.includes('x.com') || ref.url?.includes('twitter.com')) pushUnique(ref.url)
  }

  return ordered
}

async function normalizePhotoUrl(photoUrl: string | undefined): Promise<string | undefined> {
  if (!photoUrl || isSupabaseStorageUrl(photoUrl)) return photoUrl

  const cached = await cacheImageFromUrl(photoUrl, photoUrl.includes('telesco.pe')
    ? { headers: { Referer: 'https://t.me/' } }
    : undefined)

  return cached || photoUrl
}

// ============================================================================
// Type-Safe Query Helpers
// ============================================================================

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/**
 * Helper to execute Supabase queries with proper typing
 */
export async function fetchMemorialById(id: string): Promise<QueryResult<MemorialRow>> {
  const { data, error } = await supabase!
    .from('memorials')
    .select('*')
    .eq('id', id)
    .single()
  return { data, error }
}

/**
 * Fetch a single memorial by ID (exported for scripts — uses admin client to bypass RLS)
 */
export async function getMemorialById(id: string): Promise<MemorialRow | null> {
  const client = supabaseAdmin || supabase
  if (!client) return null
  const { data } = await client.from('memorials').select('*').eq('id', id).single()
  return data ?? null
}

export async function findDuplicateMemorial(
  name: string,
  nameFa: string | undefined
): Promise<QueryResult<MemorialRow>> {
  let query = supabase!.from('memorials').select('id, name, name_fa, source_links, verified, media')

  if (name && nameFa) {
    query = query.or(`name.eq."${name}",name_fa.eq."${nameFa}"`)
  } else if (name) {
    query = query.eq('name', name)
  } else if (nameFa) {
    query = query.eq('name_fa', nameFa)
  }

  const { data, error } = await query.maybeSingle()
  return { data, error }
}

async function findVerifiedDuplicate(
  name: string,
  city: string,
  excludeId: string
): Promise<QueryResult<MemorialRow>> {
  const { data, error } = await supabase!
    .from('memorials')
    .select('*')
    .eq('name', name)
    .eq('city', city)
    .eq('verified', true)
    .neq('id', excludeId)
    .maybeSingle()
  return { data, error }
}

export async function updateMemorial(
  id: string,
  updates: MemorialUpdate
): Promise<{ error: { message: string } | null }> {
  // Use admin client if available (bypasses RLS)
  const client = supabaseAdmin || supabase
  if (!client) return { error: { message: 'No Supabase client available' } }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { error } = await (client as any)
    .from('memorials')
    .update(updates)
    .eq('id', id)
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { error }
}

async function batchUpdateMemorials(
  updates: MemorialUpdate[]
): Promise<{ error: { message: string } | null }> {
  const client = supabaseAdmin || supabase
  if (!client) return { error: { message: 'No Supabase client available' } }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { error } = await (client as any)
    .from('memorials')
    .upsert(updates)
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { error }
}

async function deleteMemRecord(id: string): Promise<{ error: { message: string } | null }> {
  // Use admin client if available (bypasses RLS)
  const client = supabaseAdmin || supabase
  if (!client) return { error: { message: 'No Supabase client available' } }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { error } = await (client as any)
    .from('memorials')
    .delete()
    .eq('id', id)
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { error }
}

// ============================================================================
// Reference Merging Helpers
// ============================================================================

export function getSourceLinks(memorial: MemorialRow): ReferenceLink[] {
  return (memorial.source_links as ReferenceLink[]) || []
}

export function mergeReferences(
  existingLinks: ReferenceLink[],
  newLinks: ReferenceLink[]
): ReferenceLink[] {
  const urlsToAdd = newLinks.filter(
    newR => !existingLinks.some(currR => currR.url === newR.url)
  )
  return [...existingLinks, ...urlsToAdd]
}

async function mergeMemorialReferences(
  targetId: string,
  sourceLinks: ReferenceLink[]
): Promise<{ success: boolean; error?: string }> {
  const { data: target } = await fetchMemorialById(targetId)
  if (!target) {
    return { success: false, error: 'Target entry not found' }
  }

  const currentRefs = getSourceLinks(target)
  const mergedRefs = mergeReferences(currentRefs, sourceLinks)

  if (mergedRefs.length > currentRefs.length) {
    const { error } = await updateMemorial(targetId, { source_links: mergedRefs })
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
}

// ============================================================================
// Main API Functions
// ============================================================================

export async function mergeMemorials(
  sourceId: string,
  targetId: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }

  try {
    // Get both entries
    const { data: source, error: sourceError } = await fetchMemorialById(sourceId)
    const { data: target, error: targetError } = await fetchMemorialById(targetId)

    if (sourceError || targetError || !source || !target) {
      return { success: false, error: 'Could not find source or target entry.' }
    }

    // Merge references
    const sourceRefs = getSourceLinks(source)
    const result = await mergeMemorialReferences(targetId, sourceRefs)

    if (!result.success) return result

    // Delete the source entry
    const { error: deleteError } = await deleteMemRecord(sourceId)
    if (deleteError) return { success: false, error: deleteError.message }

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function fetchMemorials(includeUnverified = false): Promise<MemorialEntry[]> {
  if (!supabase) return fetchStaticMemorials()

  try {
    const allData: MemorialRow[] = []
    const pageSize = 1000

    // Public map only needs display fields — skip bio/testimonials/source_links to reduce payload
    const columns = includeUnverified
      ? '*'
      : 'id,name,name_fa,city,city_fa,location,location_fa,date,coords,media,verified'

    let countQuery = supabase
      .from('memorials')
      .select('*', { count: 'exact', head: true })

    if (!includeUnverified) {
      countQuery = countQuery.eq('verified', true)
    }

    const { count, error: countError } = await countQuery

    if (countError) {
      logger.error('Error fetching count', countError)
      return fetchStaticMemorials()
    }

    const totalCount = count || 0
    if (totalCount === 0) return []

    const totalPages = Math.ceil(totalCount / pageSize)
    const promises: Promise<{ data: MemorialRow[] | null; error: { message: string; code?: string } | null }>[] = []

    for (let p = 0; p < totalPages; p++) {
      let pageQuery = supabase
        .from('memorials')
        .select(columns)
        .range(p * pageSize, (p + 1) * pageSize - 1)
        .order('date', { ascending: false })

      if (!includeUnverified) {
        pageQuery = pageQuery.eq('verified', true)
      }
      promises.push(pageQuery as unknown as Promise<{ data: MemorialRow[] | null; error: { message: string; code?: string } | null }>)
    }

    const results = await Promise.all(promises)

    for (const { data, error } of results) {
      if (error) {
        logger.error('Error fetching page concurrently', error)
      } else if (data) {
        allData.push(...data)
      }
    }

    return allData.map(mapRowToEntry)
  } catch (e) {
    logger.error('Exception in fetchMemorials:', e)
    return fetchStaticMemorials()
  }
}

export async function verifyMemorial(
  id: string
): Promise<{ success: boolean; merged?: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }

  // Check for admin access (service role key) for verification operations
  if (!supabaseAdmin) {
    logger.warn('⚠️  Warning: SUPABASE_SERVICE_ROLE_KEY not set. Verification may fail due to RLS policies.');
    logger.warn('   Add VITE_SUPABASE_SERVICE_ROLE_KEY to your .env file to enable admin operations.');
  }

  try {
    // Get the current entry
    const { data: current, error: fetchError } = await fetchMemorialById(id)

    if (fetchError || !current) {
      return { success: false, error: fetchError?.message || 'Entry not found' }
    }

    // Check for verified duplicate
    const { data: existing, error: checkError } = await findVerifiedDuplicate(
      current.name,
      current.city,
      id
    )

    if (checkError) {
      logger.error('Duplicate check error during verification:', checkError)
    }

    if (existing) {
      // Merge: Add references from current to existing
      const currentRefs = getSourceLinks(current)
      const result = await mergeMemorialReferences(existing.id, currentRefs)

      if (!result.success) return result

      // Delete the duplicate pending entry
      await deleteMemRecord(id)

      return { success: true, merged: true }
    }

    // Standard verification
    const { error } = await updateMemorial(id, { verified: true })
    if (error) return { success: false, error: error.message }

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteMemorial(id: string): Promise<{ success: boolean; error?: string }> {
  // Use service role key if available (local dev), otherwise fall back to
  // authenticated session (multi-device admins — requires RLS policy for authenticated role)
  const client = supabaseAdmin || supabase
  if (!client) return { success: false, error: 'Supabase not configured' }

  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { error } = await (client as any)
      .from('memorials')
      .delete()
      .eq('id', id)
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function submitReport(
  report: Omit<ReportInsert, 'id' | 'created_at'>
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }

  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { error } = await (supabase as any)
      .from('reports')
      .insert([report])
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (error) {
      logger.error('Report submission error:', error)
      if (error.code === '42P01') {
        return { success: false, error: 'Database error: reports table not found. Please contact admin.' }
      }
      if (error.code === '42501') {
        return { success: false, error: 'Permission denied: Public submissions for reports are not allowed yet.' }
      }
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (e) {
    logger.error('Report submission exception:', e)
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function fetchReports(): Promise<{ data: ReportRow[]; error?: string }> {
  if (!supabase) return { data: [], error: 'Supabase not configured' }

  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching reports:', error)
      return { data: [], error: error.message }
    }

    return { data: data || [] }
  } catch (e) {
    logger.error('Exception fetching reports:', e)
    return { data: [], error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function deleteReport(id: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }

  try {
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function updateReportStatus(
  id: string,
  status: 'pending' | 'resolved' | 'dismissed'
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' }

  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { data, error } = await (supabase as any)
      .from('reports')
      .update({ status })
      .eq('id', id)
      .select()
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (error) {
      logger.error('Update error:', error)
      return { success: false, error: error.message }
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'No report found or permission denied.' }
    }

    return { success: true }
  } catch (e) {
    logger.error('Update exception:', e)
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function submitMemorial(
  entry: Partial<MemorialEntry>
): Promise<{ success: boolean; merged?: boolean; error?: string }> {
  const client = supabaseAdmin || supabase
  if (!client) {
    return { success: false, error: 'Database connection not available.' }
  }

  try {
    if (!entry.name) {
      return { success: false, error: 'Name is required.' }
    }

    const hasLink = entry.media?.xPost || (entry.references && entry.references.length > 0)
    if (!hasLink) {
      return { success: false, error: 'At least one link (X Post URL or a Reference) is required.' }
    }

    const isEditing = !!entry.id

    // Check for duplicates if this is a new entry
    if (!isEditing) {
      const { data: existing, error: checkError } = await findDuplicateMemorial(
        entry.name,
        entry.name_fa
      )

      if (checkError) {
        logger.error('Duplicate check error:', checkError)
      } else if (existing) {
        // MERGE LOGIC: Add new references to existing record
        const newRefs = entry.references || []
        if (newRefs.length > 0) {
          const currentRefs = getSourceLinks(existing)

          const refsToAdd = newRefs.filter(
            newR => !currentRefs.some(currR => currR.url === newR.url)
          )

          const hasTelegramPost = entry.media?.telegramPost && !(existing.media as Record<string, string> | null)?.telegramPost

          if (refsToAdd.length > 0 || hasTelegramPost) {
            const updates: MemorialUpdate = { source_links: [...currentRefs, ...refsToAdd] }

            if (hasTelegramPost && entry.media?.telegramPost) {
              updates.media = { ...(existing.media as Record<string, string> || {}), telegramPost: entry.media.telegramPost }
            }

            // Auto-verify if source is RTN
            const isRTN =
              entry.media?.telegramPost?.includes('RememberTheirNames/') ||
              (entry.references?.some(r => r.url.includes('RememberTheirNames/')))
            if (isRTN) {
              updates.verified = true
            }

            const { error: updateError } = await updateMemorial(existing.id, updates)
            if (updateError) return { success: false, error: updateError.message }

            return { success: true, merged: true }
          } else {
            return { success: false, error: 'These references already exist for this person.' }
          }
        }
      }
    }

    // Auto-extract image if missing
    const candidateUrls = getCandidateImageSourceUrls(entry.media, entry.references)
    const hasSocialLink = candidateUrls.length > 0

    if (hasSocialLink && !entry.media?.photo) {
      try {
        for (const url of candidateUrls) {
          const photo = await extractSocialImage(url)
          if (photo) {
            if (!entry.media) entry.media = {}
            entry.media.photo = await normalizePhotoUrl(photo)
            break
          }
        }
      } catch {
        // Silently fail auto-extraction
      }
    }

    if (entry.media?.photo) {
      entry.media.photo = await normalizePhotoUrl(entry.media.photo)
    }

    if (entry.media?.photos?.length) {
      const normalizedPhotos = await Promise.all(
        entry.media.photos.map(photo => normalizePhotoUrl(photo))
      )
      entry.media.photos = normalizedPhotos.filter((photo): photo is string => !!photo)
      if (!entry.media.photo && entry.media.photos.length > 0) {
        entry.media.photo = entry.media.photos[0]
      }
    }

    // Prepare data for upsert
    const id = entry.id || entry.name?.toLowerCase().trim().replace(/\s+/g, '-') || `submission-${Date.now()}`

    const isRTN =
      entry.media?.telegramPost?.includes('RememberTheirNames/') ||
      (entry.references?.some(r => r.url.includes('RememberTheirNames/')))

    const dataToSave: MemorialInsert = {
      id,
      name: entry.name || 'Unknown',
      name_fa: entry.name_fa || null,
      city: entry.city || 'Unknown',
      city_fa: entry.city_fa || null,
      location: entry.location || '',
      location_fa: entry.location_fa || null,
      date: entry.date || new Date().toISOString().split('T')[0],
      bio: entry.bio || '',
      bio_fa: entry.bio_fa || null,
      coords: entry.coords || { lat: 35.6892, lon: 51.3890 },
      media: entry.media || {},
      source_links: entry.references || [],
      testimonials: entry.testimonials || [],
      verified: entry.verified || isRTN || false
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { error } = await (client as any)
      .from('memorials')
      .upsert(dataToSave)
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

interface BatchResult {
  success: boolean;
  count: number;
  error?: string;
}

export async function batchUpdateImages(): Promise<BatchResult> {
  const client = supabaseAdmin || supabase
  if (!client) return { success: false, count: 0, error: 'Supabase not configured' }

  try {
    const { data: memorials, error: fetchError } = await client
      .from('memorials')
      .select('*')

    if (fetchError) throw fetchError

    const rows = (memorials || []) as MemorialRow[]
    const targets = rows.filter(m => {
      const media = m.media as Record<string, unknown> | null
      const refs = m.source_links as ReferenceLink[] | null
      const candidateUrls = getCandidateImageSourceUrls(media as Record<string, string> | null, refs)
      return candidateUrls.length > 0 &&
        (!media?.photo || (typeof media.photo === 'string' && !isSupabaseStorageUrl(media.photo)))
    })

    if (targets.length === 0) return { success: true, count: 0 }

    let updatedCount = 0
    const bulkUpdates: MemorialRow[] = []
    const CONCURRENCY_LIMIT = 5

    for (let i = 0; i < targets.length; i += CONCURRENCY_LIMIT) {
      const batch = targets.slice(i, i + CONCURRENCY_LIMIT)

      await Promise.all(batch.map(async (m) => {
        const media = m.media as Record<string, string>
        const refs = m.source_links as ReferenceLink[]
        const candidateUrls = getCandidateImageSourceUrls(media, refs)

        for (const url of candidateUrls) {
          const photo = await extractSocialImage(url)

          if (photo) {
            const normalizedPhoto = await normalizePhotoUrl(photo)
            const updatedMedia = { ...media, photo: normalizedPhoto || photo }
            bulkUpdates.push({ ...m, media: updatedMedia })
            break
          }
        }
      }))

      // Keep a small delay between batches to be respectful to rate limits, but significantly faster
      if (i + CONCURRENCY_LIMIT < targets.length) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    if (bulkUpdates.length > 0) {
      const chunkSize = 500
      for (let i = 0; i < bulkUpdates.length; i += chunkSize) {
        const chunk = bulkUpdates.slice(i, i + chunkSize)
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const { error: bulkError } = await (client as any)
          .from('memorials')
          .upsert(chunk)
        /* eslint-enable @typescript-eslint/no-explicit-any */

        if (bulkError) {
          console.error('Bulk update error:', bulkError)
        } else {
          updatedCount += chunk.length
        }
      }
    }

    return { success: true, count: updatedCount }
  } catch (e) {
    return { success: false, count: 0, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function batchTranslateMemorials(): Promise<BatchResult> {
  if (!supabase) return { success: false, count: 0, error: 'Supabase not configured' }

  try {
    const { data: memorials, error: fetchError } = await supabase
      .from('memorials')
      .select('*')

    if (fetchError) throw fetchError

    const rows = (memorials || []) as MemorialRow[]
    const targets = rows.filter(m => !m.name_fa || !m.city_fa || !m.bio_fa)

    if (targets.length === 0) return { success: true, count: 0 }

    const updatesToSave: MemorialUpdate[] = []
    const allTranslationKeys = new Set<keyof MemorialUpdate>()

    const chunkSize = 5
    for (let i = 0; i < targets.length; i += chunkSize) {
      const chunk = targets.slice(i, i + chunkSize)

      await Promise.all(chunk.map(async (m) => {
        const translation = await translateMemorialData({
          name: m.name,
          city: m.city,
          location: m.location || '',
          bio: m.bio || '',
          name_fa: m.name_fa || undefined,
          city_fa: m.city_fa || undefined,
          location_fa: m.location_fa || undefined,
          bio_fa: m.bio_fa || undefined
        })

        if (translation) {
          const updateData: MemorialUpdate = {}

          if (!m.name && translation.name && m.name_fa) updateData.name = translation.name
          if (!m.name_fa && translation.name_fa && m.name) updateData.name_fa = translation.name_fa

          if (!m.city && translation.city && m.city_fa) updateData.city = translation.city
          if (!m.city_fa && translation.city_fa && m.city) updateData.city_fa = translation.city_fa

          if (!m.location && translation.location && m.location_fa) updateData.location = translation.location
          if (!m.location_fa && translation.location_fa && m.location) updateData.location_fa = translation.location_fa

          if (!m.bio && translation.bio && m.bio_fa) updateData.bio = translation.bio
          if (!m.bio_fa && translation.bio_fa && m.bio) updateData.bio_fa = translation.bio_fa

          if (Object.keys(updateData).length > 0) {
            Object.keys(updateData).forEach(k => allTranslationKeys.add(k as keyof MemorialUpdate))
            updatesToSave.push({ id: m.id, ...updateData } as MemorialUpdate)
          }
        }
      }))
    }

    if (updatesToSave.length > 0) {
      // Normalize objects so they have identical keys to satisfy PostgREST bulk upsert
      const normalizedUpdates = updatesToSave.map(update => {
        const normalized = { ...update }
        allTranslationKeys.forEach(key => {
          if (!(key in normalized)) {
            // Find the original row to get the missing field's current value
            const originalRow = targets.find(t => t.id === update.id)
            if (originalRow) {
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              (normalized as any)[key] = originalRow[key as keyof MemorialRow]
            }
          }
        })
        return normalized
      })

      const { error: batchError } = await batchUpdateMemorials(normalizedUpdates)
      if (batchError) throw new Error(batchError.message)
    }

    return { success: true, count: updatesToSave.length }
  } catch (e) {
    return { success: false, count: 0, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function batchSyncLocationCoords(): Promise<BatchResult> {
  const client = supabaseAdmin || supabase
  if (!client) return { success: false, count: 0, error: 'Supabase not configured' }

  try {
    const { data: memorials, error: fetchError } = await client
      .from('memorials')
      .select('*')

    if (fetchError) throw fetchError

    const rows = (memorials || []) as MemorialRow[]
    let updatedCount = 0
    const bulkUpdates: MemorialRow[] = []

    const BATCH_SIZE = 5
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE)
      let chunkApiCalled = false

      await Promise.all(chunk.map(async (m) => {
        const update: MemorialUpdate = {}
        const coords = m.coords as { lat: number; lon: number } | null
        let itemApiCalled = false

        // Case 1: Has Location but missing/default Coordinates
        if (m.city && m.location && (!coords || (coords.lat === 35.6892 && coords.lon === 51.3890))) {
          itemApiCalled = true
          const newCoords = await geocodeLocation(m.city, m.location)
          if (newCoords) update.coords = newCoords
        }
        // Case 2: Has Coordinates but missing Location text
        else if (coords && (!m.location || m.location === '')) {
          itemApiCalled = true
          const info = await reverseGeocode(coords.lat, coords.lon)
          if (info) {
            update.location = info.location
            if (!m.city) update.city = info.city
          }
        }

        if (Object.keys(update).length > 0) {
          bulkUpdates.push({ ...m, ...update } as MemorialRow)
          updatedCount++
        }

        if (itemApiCalled) {
          chunkApiCalled = true
        }
      }))

      if (chunkApiCalled) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    if (bulkUpdates.length > 0) {
      // Chunk updates in case there are too many (e.g. Supabase limits)
      const chunkSize = 500
      for (let i = 0; i < bulkUpdates.length; i += chunkSize) {
        const chunk = bulkUpdates.slice(i, i + chunkSize)
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const { error: bulkError } = await (client as any)
          .from('memorials')
          .upsert(chunk)
        /* eslint-enable @typescript-eslint/no-explicit-any */

        if (bulkError) {
          logger.error('Bulk update error:', bulkError)
        }
      }
    }

    return { success: true, count: updatedCount }
  } catch (e) {
    return { success: false, count: 0, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// ============================================================================
// Fallback Static Data
// ============================================================================

async function fetchStaticMemorials(): Promise<MemorialEntry[]> {
  try {
    const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.BASE_URL : '/'
    const url = `${baseUrl}data/memorials.json`

    // Try reading from disk in Node environment
    if (typeof process !== 'undefined' && process.versions && process.versions.node && (url.startsWith('/') || !url.startsWith('http'))) {
      const fs = await import('fs/promises')
      const path = await import('path')
      const fullPath = url.startsWith('/')
        ? path.join(process.cwd(), 'public', url)
        : path.join(process.cwd(), 'public', 'data', 'memorials.json')

      try {
        const content = await fs.readFile(fullPath, 'utf-8')
        return JSON.parse(content)
      } catch (err) {
        logger.warn('Failed to read static memorials from disk, falling back to fetch', err)
      }
    }

    const response = await fetch(url)
    return response.json()
  } catch (e) {
    logger.error('Error fetching static memorials:', e)
    return []
  }
}

export function findDuplicateMemorialClient(
  memorials: MemorialEntry[],
  name: string,
  city?: string,
  name_fa?: string,
  excludeId?: string
): MemorialEntry | undefined {
  const normalizedName = name?.toLowerCase().trim() || ''
  const currentNameFa = name_fa?.trim() || ''
  const currentCity = city?.toLowerCase().trim()

  if (normalizedName.length < 3 && currentNameFa.length < 3) {
    return undefined
  }

  const nameParts = normalizedName.split(/\s+/).filter(p => p.length > 2)
  const nameFaParts = currentNameFa.split(/\s+/).filter(p => p.length > 1)

  // Common prefixes to ignore in partial matches
  const commonPrefixes = ['syed', 'seyyed', 'sayyid', 'mir', 'haji', 'haj', 'mullah', 'sheikh']
  const filteredParts = nameParts.filter(p => !commonPrefixes.includes(p))

  return memorials.find(m => {
    if (excludeId && m.id === excludeId) return false

    const mName = m.name.toLowerCase().trim()
    const mNameFa = (m.name_fa || '').trim()
    const mCity = m.city.toLowerCase().trim()
    const mLocation = (m.location || '').toLowerCase().trim()

    // 1. Exact match (High Confidence) - English or Persian
    // Only definitive duplicate if city also matches or is unknown
    const namesMatch = (normalizedName && mName === normalizedName) || (currentNameFa && mNameFa === currentNameFa)
    const citiesMatch = !currentCity || !mCity || mCity === currentCity
    if (namesMatch && citiesMatch) return true

    // 2. Persian Partial Match (High Confidence)
    // Persian spellings are more consistent than English transliterations
    if (nameFaParts.length >= 2) {
      const faMatch = nameFaParts.every(part => mNameFa.includes(part))
      if (faMatch) return true
    }

    // 3. Significant English Name Parts + Location (Medium Confidence)
    if (filteredParts.length >= 2 && currentCity) {
      const nameMatch = filteredParts.every(part => mName.includes(part))
      const cityMatch = mCity.includes(currentCity) || currentCity.includes(mCity) || mLocation.includes(currentCity)
      if (nameMatch && cityMatch) return true
    }

    // 4. Full include match (Medium Confidence)
    if (normalizedName.length > 10 && mName.includes(normalizedName)) return true
    if (currentNameFa.length > 5 && mNameFa.includes(currentNameFa)) return true

    return false
  })
}

export function mapRowToEntry(row: MemorialRow): MemorialEntry {
  return {
    id: row.id,
    name: row.name,
    name_fa: row.name_fa || undefined,
    city: row.city,
    city_fa: row.city_fa || undefined,
    location: row.location || '',
    location_fa: row.location_fa || undefined,
    date: row.date,
    coords: row.coords as { lat: number; lon: number },
    bio: row.bio,
    bio_fa: row.bio_fa || undefined,
    testimonials: Array.isArray(row.testimonials) ? (row.testimonials as string[]) : undefined,
    media: row.media as MemorialEntry['media'],
    references: (row.source_links as ReferenceLink[]) || [],
    verified: row.verified
  }
}
