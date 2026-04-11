import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJinaReader } from '../jinaReader';

describe('fetchJinaReader', () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue(new Response('Mock Response'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  const expectedHeaders = {
    'X-No-Cache': 'true',
    'X-With-Images-Summary': 'true',
    'Accept': 'text/plain'
  };

  it('fetches a generic URL without modification', async () => {
    const url = 'https://example.com/page';
    await fetchJinaReader(url);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://r.jina.ai/https://example.com/page',
      expect.objectContaining({ headers: expectedHeaders })
    );
  });

  describe('Instagram URLs', () => {
    it('transforms basic Instagram URL to captioned embed', async () => {
      const url = 'https://instagram.com/p/12345';
      await fetchJinaReader(url);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://instagram.com/p/12345/embed/captioned/',
        expect.objectContaining({ headers: expectedHeaders })
      );
    });

    it('transforms Instagram URL with trailing slash', async () => {
      const url = 'https://instagram.com/p/12345/';
      await fetchJinaReader(url);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://instagram.com/p/12345/embed/captioned/',
        expect.objectContaining({ headers: expectedHeaders })
      );
    });

    it('transforms Instagram URL with query parameters', async () => {
      const url = 'https://instagram.com/p/12345?utm_source=ig_web_copy_link';
      await fetchJinaReader(url);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://instagram.com/p/12345/embed/captioned/',
        expect.objectContaining({ headers: expectedHeaders })
      );
    });
  });

  describe('Telegram URLs', () => {
    it('adds embed=1 to basic Telegram URL', async () => {
      const url = 'https://t.me/channel/123';
      await fetchJinaReader(url);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://t.me/channel/123?embed=1',
        expect.objectContaining({ headers: expectedHeaders })
      );
    });

    it('replaces /s/ with / and adds embed=1', async () => {
      const url = 'https://t.me/s/channel/123';
      await fetchJinaReader(url);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://t.me/channel/123?embed=1',
        expect.objectContaining({ headers: expectedHeaders })
      );
    });

    it('appends embed=1 with & if query parameters already exist', async () => {
      const url = 'https://t.me/channel/123?foo=bar';
      await fetchJinaReader(url);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://t.me/channel/123?foo=bar&embed=1',
        expect.objectContaining({ headers: expectedHeaders })
      );
    });

    it('does not add another embed=1 if it is already present', async () => {
      const url = 'https://t.me/channel/123?embed=1';
      await fetchJinaReader(url);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://t.me/channel/123?embed=1',
        expect.objectContaining({ headers: expectedHeaders })
      );
    });

    it('does not add another embed=1 if it is already present along with other queries', async () => {
      const url = 'https://t.me/channel/123?foo=bar&embed=1';
      await fetchJinaReader(url);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r.jina.ai/https://t.me/channel/123?foo=bar&embed=1',
        expect.objectContaining({ headers: expectedHeaders })
      );
    });
  });
});
