import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../supabase', () => {
  const mockEq = vi.fn().mockImplementation(async () => {
    await new Promise(r => setTimeout(r, 20)) // simulate 20ms DB latency
    return { error: null }
  })
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })

  const mockUpsert = vi.fn().mockImplementation(async () => {
    await new Promise(r => setTimeout(r, 20)) // simulate 20ms DB latency
    return { error: null }
  })

  // Generate 50 mock targets
  const mockTargets = Array.from({ length: 50 }).map((_, i) => ({
    id: `target-${i}`,
    media: { xPost: `http://x.com/post${i}` },
    source_links: [],
    name: 'Test',
    city: 'Test City'
  }))

  const mockSelect = vi.fn().mockResolvedValue({ data: mockTargets, error: null })

  const mockFrom = vi.fn().mockImplementation(() => {
    return {
      select: mockSelect,
      update: mockUpdate,
      upsert: mockUpsert
    }
  })

  const mockClient = { from: mockFrom }

  return {
    get supabase() { return mockClient },
    get supabaseAdmin() { return null }
  }
})

vi.mock('../imageExtractor', () => {
  return {
    extractSocialImage: vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 5)) // 5ms latency for extraction
      return 'http://example.com/photo.jpg'
    })
  }
})

describe('batchUpdateImages Performance Benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('measures execution time of batchUpdateImages', async () => {
    // Dynamically import to ensure fresh module evaluation
    const { batchUpdateImages } = await import('../dataService')

    const start = performance.now()
    const result = await batchUpdateImages()
    const end = performance.now()

    // eslint-disable-next-line no-console
    console.log(`[BENCHMARK] Execution time for 50 records: ${Math.round(end - start)}ms`)
    expect(result.success).toBe(true)
    expect(result.count).toBe(50)
  }, 15000)
})
