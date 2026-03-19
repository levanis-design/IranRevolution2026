import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractTelegramImage } from '../imageExtractor';
import { uploadImageToSupabase } from '../supabase';

vi.mock('../supabase', () => ({
  uploadImageToSupabase: vi.fn(),
}));

describe('extractTelegramImage', () => {
  const originalFetch = global.fetch;
  let mockFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Suppress console.error in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should return null for invalid or non-Telegram URLs', async () => {
    expect(await extractTelegramImage('')).toBeNull();
    expect(await extractTelegramImage('https://example.com')).toBeNull();
    expect(await extractTelegramImage('https://twitter.com/abc')).toBeNull();
  });

  describe('fetchAndUploadTelegramImage logic', () => {
    it('should successfully extract and upload image via og:image meta tag', async () => {
      const telegramUrl = 'https://t.me/channel/123';
      const telescoUrl = 'https://cdn1.telesco.pe/file/abc';
      const supabaseUrl = 'https://supabase.com/storage/abc.jpg';

      const arrayBuffer = new ArrayBuffer(8);

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return {
            ok: true,
            text: async () => `<html><meta property="og:image" content="${telescoUrl}"></html>`
          };
        }
        if (url === telescoUrl) {
          return {
            ok: true,
            arrayBuffer: async () => arrayBuffer
          };
        }
        return { ok: false };
      });

      vi.mocked(uploadImageToSupabase).mockResolvedValue(supabaseUrl);

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBe(supabaseUrl);
      expect(mockFetch).toHaveBeenCalledWith(telegramUrl);
      expect(mockFetch).toHaveBeenCalledWith(telescoUrl, { headers: { 'Referer': 'https://t.me/' } });
      expect(uploadImageToSupabase).toHaveBeenCalledWith(arrayBuffer, telescoUrl);
    });

    it('should successfully extract and upload image via raw telesco.pe link if og:image is absent', async () => {
      const telegramUrl = 'https://t.me/channel/123';
      const telescoUrl = 'https://cdn2.telesco.pe/file/xyz';
      const supabaseUrl = 'https://supabase.com/storage/xyz.jpg';

      const arrayBuffer = new ArrayBuffer(8);

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return {
            ok: true,
            text: async () => `<html><body>Some text ${telescoUrl} more text</body></html>`
          };
        }
        if (url === telescoUrl) {
          return {
            ok: true,
            arrayBuffer: async () => arrayBuffer
          };
        }
        return { ok: false };
      });

      vi.mocked(uploadImageToSupabase).mockResolvedValue(supabaseUrl);

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBe(supabaseUrl);
      expect(uploadImageToSupabase).toHaveBeenCalledWith(arrayBuffer, telescoUrl);
    });

    it('should fall back to Jina Reader if fetchAndUploadTelegramImage fails to fetch telegram URL', async () => {
      const telegramUrl = 'https://t.me/channel/123';

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return { ok: false };
        }
        if (url.includes('r.jina.ai')) {
          return {
            ok: true,
            text: async () => `![img](https://example.com/jina.jpg)`
          };
        }
        return { ok: false };
      });

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBe('https://example.com/jina.jpg');
    });

    it('should fall back to Jina Reader if image download fails', async () => {
      const telegramUrl = 'https://t.me/channel/123';
      const telescoUrl = 'https://cdn1.telesco.pe/file/abc';

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return {
            ok: true,
            text: async () => `<html><meta property="og:image" content="${telescoUrl}"></html>`
          };
        }
        if (url === telescoUrl) {
          return { ok: false }; // Download fails
        }
        if (url.includes('r.jina.ai')) {
          return {
            ok: true,
            text: async () => `![img](https://example.com/jina2.jpg)`
          };
        }
        return { ok: false };
      });

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBe('https://example.com/jina2.jpg');
      expect(uploadImageToSupabase).not.toHaveBeenCalled();
    });

    it('should fall back to Jina Reader if uploadImageToSupabase returns null', async () => {
      const telegramUrl = 'https://t.me/channel/123';
      const telescoUrl = 'https://cdn1.telesco.pe/file/abc';

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return {
            ok: true,
            text: async () => `<html><meta property="og:image" content="${telescoUrl}"></html>`
          };
        }
        if (url === telescoUrl) {
          return {
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(8)
          };
        }
        if (url.includes('r.jina.ai')) {
          return {
            ok: true,
            text: async () => `![img](https://example.com/jina3.jpg)`
          };
        }
        return { ok: false };
      });

      vi.mocked(uploadImageToSupabase).mockResolvedValue(null);

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBe('https://example.com/jina3.jpg');
      expect(uploadImageToSupabase).toHaveBeenCalled();
    });
  });

  describe('Jina Reader fallback logic', () => {
    it('should successfully extract a single unique image', async () => {
      const telegramUrl = 'https://t.me/channel/123';

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return { ok: true, text: async () => 'no images here' };
        }
        if (url.includes('r.jina.ai')) {
          return {
            ok: true,
            text: async () => `
              ![profile](https://example.com/profile.jpg)
              Some text
              ![content](https://example.com/content.jpg)
              ![profile](https://example.com/profile.jpg)
            `
          };
        }
        return { ok: false };
      });

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBe('https://example.com/content.jpg');
      // Ensure embed=1 was appended correctly
      expect(mockFetch).toHaveBeenCalledWith('https://r.jina.ai/https://t.me/channel/123?embed=1', expect.any(Object));
    });

    it('should append embed=1 to targetUrl if missing and handle /s/ replacement', async () => {
      const telegramUrl = 'https://t.me/s/channel/123'; // Note the /s/

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return { ok: true, text: async () => 'no images' };
        }
        if (url.includes('r.jina.ai')) {
          return {
            ok: true,
            text: async () => `![img](https://example.com/content2.jpg)`
          };
        }
        return { ok: false };
      });

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBe('https://example.com/content2.jpg');
      // Should replace /s/ with / and append ?embed=1
      expect(mockFetch).toHaveBeenCalledWith('https://r.jina.ai/https://t.me/channel/123?embed=1', expect.any(Object));
    });

    it('should return null if Jina API returns an error', async () => {
      const telegramUrl = 'https://t.me/channel/123';

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return { ok: true, text: async () => 'no images' };
        }
        if (url.includes('r.jina.ai')) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
          };
        }
        return { ok: false };
      });

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBeNull();
    });

    it('should return null if Jina API content has no markdown images', async () => {
      const telegramUrl = 'https://t.me/channel/123';

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return { ok: true, text: async () => 'no images' };
        }
        if (url.includes('r.jina.ai')) {
          return {
            ok: true,
            text: async () => `Just some text without any images.`
          };
        }
        return { ok: false };
      });

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBeNull();
    });

    it('should return null if all images are filtered out (icons/logos or duplicated)', async () => {
      const telegramUrl = 'https://t.me/channel/123';

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return { ok: true, text: async () => 'no images' };
        }
        if (url.includes('r.jina.ai')) {
          return {
            ok: true,
            text: async () => `
              ![logo](https://example.com/logo.png)
              ![icon](https://example.com/icon.jpg)
              ![profile](https://example.com/profile.jpg)
              ![profile](https://example.com/profile.jpg)
            `
          };
        }
        return { ok: false };
      });

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBeNull();
    });

    it('should return null if an error is thrown during extraction', async () => {
      const telegramUrl = 'https://t.me/channel/123';

      mockFetch.mockImplementation(async (url: string) => {
        if (url === telegramUrl) {
          return { ok: true, text: async () => 'no images' };
        }
        if (url.includes('r.jina.ai')) {
          throw new Error('Network error');
        }
        return { ok: false };
      });

      const result = await extractTelegramImage(telegramUrl);

      expect(result).toBeNull();
    });
  });
});
