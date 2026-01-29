
import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY // Using Anon key is fine for reading public data

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function updateStaticJson() {
  console.log('Fetching all memorials from Supabase...')
  
  let allData: any[] = []
  let page = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('memorials')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching data:', error)
      process.exit(1)
    }

    if (!data || data.length === 0) {
      hasMore = false
    } else {
      allData = [...allData, ...data]
      if (data.length < pageSize) {
        hasMore = false
      }
      page++
    }
  }

  console.log(`Fetched ${allData.length} records. Mapping to static format...`)

  const mappedData = allData.map(row => ({
    id: row.id,
    name: row.name,
    name_fa: row.name_fa || undefined,
    city: row.city,
    city_fa: row.city_fa || undefined,
    location: row.location || '',
    location_fa: row.location_fa || undefined,
    date: row.date,
    coords: row.coords,
    bio: row.bio,
    bio_fa: row.bio_fa || undefined,
    testimonials: Array.isArray(row.testimonials) ? row.testimonials : undefined,
    media: row.media,
    references: row.source_links || [],
    verified: row.verified,
    sensitive: row.sensitive,
    sensitiveMedia: row.sensitiveMedia
  }))

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const outputPath = path.resolve(__dirname, '../public/data/memorials.json')

  console.log(`Writing to ${outputPath}...`)
  await fs.writeFile(outputPath, JSON.stringify(mappedData, null, 2))
  console.log('✅ Static data updated successfully!')
}

updateStaticJson().catch(console.error)
