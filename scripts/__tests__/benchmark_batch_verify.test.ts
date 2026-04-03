import { expect, test, vi, beforeEach } from 'vitest';
import { batchVerifyIranVictims } from '../batch_verify_iranvictims';
import * as dataService from '../../src/modules/dataService';

// Mock data service
vi.mock('../../src/modules/dataService', () => ({
  fetchMemorials: vi.fn(),
  verifyMemorial: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

test('benchmarks batch verification', async () => {
  // Setup 50 items
  const mockMemorials = Array.from({ length: 50 }).map((_, i) => ({
    id: `id-${i}`,
    name: `Name ${i}`,
    city: 'Tehran',
    verified: false,
    references: [{ url: 'https://iranvictims.com/abc' }],
  }));

  vi.mocked(dataService.fetchMemorials).mockResolvedValue(mockMemorials as any);

  // Simulate verifyMemorial taking 50ms
  vi.mocked(dataService.verifyMemorial).mockImplementation(async (_id) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return { success: true, merged: false };
  });

  const start = performance.now();
  await batchVerifyIranVictims();
  const end = performance.now();

  const duration = end - start;
  // Use warn to bypass console.log mock
  console.warn(`[BASELINE] Duration: ${duration}ms`);

  expect(dataService.verifyMemorial).toHaveBeenCalledTimes(50);
}, 30000); // 30 seconds timeout
