import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const mockTargets = Array.from({ length: 1000 }).map((_, i) => ({
    id: `target-${i}`,
    name: 'Test',
    city: 'Test City'
  }))

  const createQueryChain = () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: function(resolve: (value: unknown) => void) {
        setTimeout(() => {
          const selectMock = chain.select as unknown as { mock: { calls: unknown[][] } };
          const selectArgs = selectMock.mock.calls.length > 0 ? selectMock.mock.calls[selectMock.mock.calls.length - 1] : [];
          // Assuming selectArgs[1] might be the object containing head: true
          const argObj = selectArgs[1] as { head?: boolean } | undefined;
          const isHead = argObj && argObj.head === true;
          if (isHead) {
             resolve({ data: null, error: null, count: 3000 })
          } else {
             resolve({ data: mockTargets, error: null, count: null })
          }
        }, 50)
      }
    }
    return chain
  }

  const mockClient = {
    from: vi.fn().mockImplementation(() => {
      return createQueryChain()
    })
  }

  return {
    get supabase() { return mockClient },
    get supabaseAdmin() { return null }
  }
})

describe('fetchMemorials Performance Benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('measures execution time of fetchMemorials', async () => {
    const { fetchMemorials } = await import('../dataService')

    const start = performance.now()
    const result = await fetchMemorials(true)
    const end = performance.now()

    // eslint-disable-next-line no-console
    console.log(`[BENCHMARK] Execution time for fetchMemorials: ${Math.round(end - start)}ms`)
    expect(result.length).toBe(3000)
  }, 15000)
})
