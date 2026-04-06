import fs from 'fs/promises'
import path from 'path'

type ReferenceLink = { label?: string; url?: string }
type MemorialRecord = {
  id: string
  name: string
  media?: {
    photo?: string
    xPost?: string
    telegramPost?: string
  } | null
  references?: ReferenceLink[]
}

type SourceBucket =
  | 'telegram'
  | 'instagram'
  | 'x'
  | 'hengaw'
  | 'wikipedia'
  | 'facebook'
  | 'other'
  | 'none'

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

function getAllUrls(record: MemorialRecord): string[] {
  const refs = (record.references || []).map(ref => ref.url).filter(Boolean) as string[]
  const mediaUrls = [record.media?.telegramPost, record.media?.xPost].filter(Boolean) as string[]
  return [...new Set([...refs, ...mediaUrls])]
}

function classifyBucket(urls: string[]): SourceBucket {
  if (urls.length === 0) return 'none'
  if (urls.some(url => url.includes('t.me/'))) return 'telegram'
  if (urls.some(url => url.includes('instagram.com'))) return 'instagram'
  if (urls.some(url => url.includes('hengaw.net'))) return 'hengaw'
  if (urls.some(url => url.includes('wikipedia.org'))) return 'wikipedia'
  if (urls.some(url => url.includes('facebook.com'))) return 'facebook'
  if (urls.some(url => url.includes('x.com') || url.includes('twitter.com'))) return 'x'
  return 'other'
}

async function main() {
  const inputPath = getArg('--input') || 'public/data/memorials.json'
  const outputDir = getArg('--output-dir')

  const raw = await fs.readFile(inputPath, 'utf8')
  const data = JSON.parse(raw) as MemorialRecord[]

  const withPhoto = data.filter(record => !!record.media?.photo)
  const noPhoto = data.filter(record => !record.media?.photo)
  const hotlinked = withPhoto.filter(record => !record.media?.photo?.includes('supabase.co'))

  const buckets = new Map<SourceBucket, MemorialRecord[]>()
  for (const bucket of ['telegram', 'instagram', 'x', 'hengaw', 'wikipedia', 'facebook', 'other', 'none'] as const) {
    buckets.set(bucket, [])
  }

  for (const record of noPhoto) {
    const bucket = classifyBucket(getAllUrls(record))
    buckets.get(bucket)!.push(record)
  }

  const summary = {
    total: data.length,
    withPhoto: withPhoto.length,
    noPhoto: noPhoto.length,
    withPhotoPct: Number(((withPhoto.length / data.length) * 100).toFixed(2)),
    noPhotoPct: Number(((noPhoto.length / data.length) * 100).toFixed(2)),
    hotlinked: hotlinked.length,
    missingBySource: Object.fromEntries(
      [...buckets.entries()].map(([bucket, records]) => [bucket, records.length])
    ),
    examples: Object.fromEntries(
      [...buckets.entries()].map(([bucket, records]) => [
        bucket,
        records.slice(0, 10).map(record => ({
          id: record.id,
          name: record.name,
          urls: getAllUrls(record).slice(0, 6)
        }))
      ])
    )
  }

  const lines = [
    '# Photo Coverage Report',
    '',
    `- Total memorials: ${summary.total}`,
    `- With photo: ${summary.withPhoto} (${summary.withPhotoPct}%)`,
    `- Without photo: ${summary.noPhoto} (${summary.noPhotoPct}%)`,
    `- Remaining non-Supabase photos: ${summary.hotlinked}`,
    '',
    '## Missing By Source',
    ...([...buckets.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([bucket, records]) => `- ${bucket}: ${records.length}`)),
    '',
    '## Sample Missing Records',
    ...([...buckets.entries()]
      .filter(([, records]) => records.length > 0)
      .sort((a, b) => b[1].length - a[1].length)
      .flatMap(([bucket, records]) => {
        const examples = records.slice(0, 5)
        return [
          `### ${bucket}`,
          ...examples.map(record => {
            const urls = getAllUrls(record).slice(0, 3).join(' | ') || 'No source URLs'
            return `- ${record.name} (${record.id}): ${urls}`
          }),
          ''
        ]
      }))
  ]

  const markdown = `${lines.join('\n')}\n`

  if (outputDir) {
    await fs.mkdir(outputDir, { recursive: true })
    await fs.writeFile(path.join(outputDir, 'photo-coverage.json'), JSON.stringify(summary, null, 2))
    await fs.writeFile(path.join(outputDir, 'photo-coverage.md'), markdown)
  }

  console.log(markdown)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
