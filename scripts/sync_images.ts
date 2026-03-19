import { batchUpdateImages } from '../src/modules/dataService.ts'

console.log('🖼️  Syncing missing memorial photos from social media links...')
const result = await batchUpdateImages()
if (result.error) {
  console.error('❌ Error:', result.error)
  process.exit(1)
}
console.log(`✅ Done — ${result.count} photos updated`)
