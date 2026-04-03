import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processTwitterTweet } from '../twitter_scraper';
import * as ai from '../../../src/modules/ai';
import * as dataService from '../../../src/modules/dataService';
import * as imageExtractor from '../../../src/modules/imageExtractor';

vi.mock('../../../src/modules/ai');
vi.mock('../../../src/modules/dataService');
vi.mock('../../../src/modules/imageExtractor');

describe('twitter_scraper Performance Benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('a'.repeat(200)) // Content length > 100
    });

    // eslint-disable-next-line no-console
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // eslint-disable-next-line no-console
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('measures execution time of processTwitterTweet', async () => {
    const victims = Array.from({ length: 20 }, (_, i) => ({
      name: `Victim ${i}`,
      city: 'Tehran'
    }));

    vi.mocked(ai.extractMemorialData).mockResolvedValue(victims as any);
    vi.mocked(imageExtractor.extractSocialImage).mockResolvedValue('http://example.com/image.jpg');
    vi.mocked(dataService.submitMemorial).mockImplementation(async () => {
      // Simulate DB delay
      await new Promise(resolve => setTimeout(resolve, 50));
      return { success: true, merged: false };
    });

    const stats = { successCount: 0, skipCount: 0, errorCount: 0 };
    const memorialUrls = new Set<string>();

    const start = Date.now();
    await processTwitterTweet('12345', 'IranRevolution', memorialUrls, stats);
    const end = Date.now();

    const duration = end - start;
    // eslint-disable-next-line no-console
    console.log(`[BENCHMARK] processTwitterTweet for ${victims.length} victims: ${duration}ms`);

    expect(stats.successCount).toBe(victims.length);
  });
});
