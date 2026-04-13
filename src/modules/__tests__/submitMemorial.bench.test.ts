import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../supabase', () => {
  const mockInsert = vi.fn().mockImplementation(async () => {
    await new Promise(r => setTimeout(r, 20)) // simulate 20ms DB latency
    return { error: null }
  })

  const mockUpsert = vi.fn().mockImplementation(async () => {
    await new Promise(r => setTimeout(r, 20)) // simulate 20ms DB latency
    return { error: null }
  })

  const mockFrom = vi.fn().mockImplementation(() => {
    const queryBuilder = {
      insert: mockInsert,
      upsert: mockUpsert,
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    }
    return queryBuilder
  })

  const mockClient = { from: mockFrom }

  return {
    get supabase() { return mockClient },
    get supabaseAdmin() { return mockClient }
  }
})

vi.mock('../imageExtractor', () => {
  return {
    extractSocialImage: vi.fn().mockImplementation(async (_url: string) => {
      await new Promise(r => setTimeout(r, 50)) // 50ms latency for extraction
      // simulate all failing to extract to maximize loop execution time
      return null
    })
  }
})

describe('submitMemorial Performance Benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('measures execution time of submitMemorial with multiple candidate URLs', async () => {
    // We dynamically import submitMemorial so the module relies on the mocked supabase and imageExtractor
    const { submitMemorial } = await import('../dataService')

    const mockEntry = {
      name: 'Test Benchmark Name',
      media: {
        xPost: 'https://x.com/test'
      },
      references: [
        { url: 'https://example.com/1' },
        { url: 'https://example.com/2' },
        { url: 'https://example.com/3' },
        { url: 'https://example.com/4' },
        { url: 'https://example.com/5' },
        { url: 'https://example.com/6' },
      ]
    }

    const start = performance.now()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await submitMemorial(mockEntry as any)
    const end = performance.now()

    // eslint-disable-next-line no-console
    console.log(`[BENCHMARK] Execution time for submitMemorial: ${Math.round(end - start)}ms`)
    // Write directly to stdout to ensure we see the result regardless of vitest intercept
    process.stdout.write(`[BENCHMARK] submitMemorial duration: ${end - start}ms\n`)
    expect(result.success).toBe(true)
  }, 15000)
})
