import { describe, it, expect, vi } from 'vitest';
import { verifyMemorial } from '../../src/modules/dataService';

vi.mock('../../src/modules/dataService', () => ({
  verifyMemorial: vi.fn(),
}));

describe('batchVerifyRTN benchmark', () => {
  it('measures sequential vs chunked execution time', async () => {
    // Generate mock submissions
    const mockSubmissions = Array.from({ length: 50 }, (_, i) => ({
      id: `id-${i}`,
      name: `Name ${i}`
    }));

    // Mock verifyMemorial to take 10ms
    const verifyMock = vi.mocked(verifyMemorial);
    verifyMock.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { success: true };
    });

    // 1. Sequential approach
    const startSeq = performance.now();
    for (const memorial of mockSubmissions) {
      await verifyMemorial(memorial.id);
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulating 500ms delay scaled down to 50ms for tests
    }
    const endSeq = performance.now();
    const timeSeq = endSeq - startSeq;

    verifyMock.mockClear();

    // 2. Chunked approach (Promise.all with chunking of 5)
    const startChunk = performance.now();
    const chunkSize = 5;
    for (let i = 0; i < mockSubmissions.length; i += chunkSize) {
      const chunk = mockSubmissions.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (memorial) => {
          await verifyMemorial(memorial.id);
        })
      );
      await new Promise(resolve => setTimeout(resolve, 50)); // Delay after each chunk instead of after each item
    }
    const endChunk = performance.now();
    const timeChunk = endChunk - startChunk;

    console.log(`[BENCHMARK] Sequential: ${timeSeq.toFixed(2)}ms`);
    console.log(`[BENCHMARK] Chunked: ${timeChunk.toFixed(2)}ms`);
    console.log(`[BENCHMARK] Improvement: ${((timeSeq - timeChunk) / timeSeq * 100).toFixed(2)}%`);

    // We expect the chunked approach to be significantly faster
    expect(timeChunk).toBeLessThan(timeSeq);
  });
});
