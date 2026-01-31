import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_SUPABASE_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null

const BUCKET_NAME = 'memorial-images'

export async function uploadImageToSupabase(buffer: Buffer | ArrayBuffer, originalUrl: string): Promise<string | null> {
  if (!supabase) return null

  try {
    const ext = originalUrl.split('.').pop()?.split('?')[0] || 'jpg'
    const filename = `${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)}.${ext}`
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, buffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: false
      })

    if (error) {
      console.error('Supabase upload error:', error.message)
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
