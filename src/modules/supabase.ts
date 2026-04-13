import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { logger } from './logger'

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_SUPABASE_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY

// Service role key for admin operations (bypasses RLS)
const supabaseServiceRoleKey = (typeof import.meta !== 'undefined' && import.meta.env)
  ? import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null

// Admin client with service role key (bypasses RLS) - used for verification operations
export const supabaseAdmin = (supabaseUrl && supabaseServiceRoleKey)
  ? createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  : null

const BUCKET_NAME = 'memorial-images'

export function isSupabaseStorageUrl(url: string | null | undefined): boolean {
  return !!(url && supabaseUrl && url.includes(supabaseUrl))
}

export function guessImageExtension(originalUrl: string): string {
  try {
    const parsed = new URL(originalUrl)
    const pathname = parsed.pathname.toLowerCase()
    const pathMatch = pathname.match(/\.([a-z0-9]{2,5})$/i)
    if (pathMatch) {
      const ext = pathMatch[1]
      return ext === 'jpeg' ? 'jpg' : ext
    }

    const format = parsed.searchParams.get('format')?.toLowerCase()
    if (format && /^(jpg|jpeg|png|webp|gif|heic|avif)$/i.test(format)) {
      return format === 'jpeg' ? 'jpg' : format
    }
  } catch {
    const fallbackMatch = originalUrl.toLowerCase().match(/\.([a-z0-9]{2,5})(?:\?|$)/i)
    if (fallbackMatch) {
      return fallbackMatch[1] === 'jpeg' ? 'jpg' : fallbackMatch[1]
    }
  }

  return 'jpg'
}

export async function uploadImageToSupabase(buffer: Buffer | ArrayBuffer, originalUrl: string): Promise<string | null> {
  const client = supabaseAdmin || supabase
  if (!client) return null

  try {
    const ext = guessImageExtension(originalUrl)
    const filename = `${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)}.${ext}`
    
    const { error } = await client.storage
      .from(BUCKET_NAME)
      .upload(filename, buffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: false
      })

    if (error) {
      logger.error('Supabase upload error:', error.message)
      return null
    }

    const { data: { publicUrl } } = client.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filename)

    return publicUrl
  } catch (error) {
    logger.error('Upload exception:', error)
    return null
  }
}

export async function cacheImageFromUrl(url: string, init?: RequestInit): Promise<string | null> {
  if (!url) return null
  if (isSupabaseStorageUrl(url)) return url

  try {
    const response = await fetch(url, init)
    if (!response.ok) {
      logger.error('Image download failed:', response.status, response.statusText, url)
      return null
    }

    const buffer = await response.arrayBuffer()
    return await uploadImageToSupabase(buffer, url)
  } catch (error) {
    logger.error('Image cache exception:', error)
    return null
  }
}
