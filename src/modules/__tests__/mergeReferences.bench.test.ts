import { describe, it, expect } from 'vitest'
import { mergeReferences } from '../dataService'

describe('mergeReferences Performance Benchmark', () => {
  it('measures execution time of mergeReferences', () => {
    // Generate large arrays of references
    const existingLinks = Array.from({ length: 10000 }).map((_, i) => ({
      label: `Title ${i}`,
      url: `http://example.com/link${i}`
    }));

    // Some overlapping, some new
    const newLinks = Array.from({ length: 10000 }).map((_, i) => ({
      label: `New Title ${i + 5000}`,
      url: `http://example.com/link${i + 5000}`
    }));

    const start = performance.now()
    const result = mergeReferences(existingLinks, newLinks)
    const end = performance.now()

    // eslint-disable-next-line no-console
    console.log(`[BENCHMARK] Execution time for mergeReferences (10k items): ${Math.round(end - start)}ms`)
    expect(result.length).toBe(15000)
  })
})
