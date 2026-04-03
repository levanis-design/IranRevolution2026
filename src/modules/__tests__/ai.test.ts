import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const globalFetch = global.fetch;

describe('extractMemorialData', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let extractMemorialData: (url: string, content?: string) => Promise<unknown[]>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'valid-test-key');
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Silence console.error for clean test output
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const aiModule = await import('../ai');
    extractMemorialData = aiModule.extractMemorialData;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = globalFetch;
    vi.clearAllMocks();
  });

  describe('API Key Validation', () => {
    it('throws an error if API key is not set', async () => {
      vi.stubEnv('VITE_OPENROUTER_API_KEY', '');
      vi.resetModules();
      const newModule = await import('../ai');
      await expect(newModule.extractMemorialData('http://example.com')).rejects.toThrow(/Invalid OpenRouter API Key/);
    });

    it('throws an error if API key is default placeholder', async () => {
      vi.stubEnv('VITE_OPENROUTER_API_KEY', 'sk-or-v1-...');
      vi.resetModules();
      const newModule = await import('../ai');
      await expect(newModule.extractMemorialData('http://example.com')).rejects.toThrow(/Invalid OpenRouter API Key/);
    });
  });

  describe('Direct Content Extraction (bypassing Jina)', () => {
    it('successfully extracts data when content is provided directly', async () => {
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify([{ name: 'Test User', city: 'Tehran' }])
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAiResponse
      });

      const result = await extractMemorialData('http://example.com', 'Some provided content about Test User from Tehran.');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.any(Object));
      expect(result).toEqual([{ name: 'Test User', city: 'Tehran' }]);
    });

    it('wraps a single object response in an array', async () => {
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ name: 'Single User', city: 'Rasht' })
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAiResponse
      });

      const result = await extractMemorialData('http://example.com', 'Content about Single User');

      expect(result).toEqual([{ name: 'Single User', city: 'Rasht' }]);
    });

    it('handles markdown wrapped JSON correctly', async () => {
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: "```json\n[\n  { \"name\": \"Markdown User\", \"city\": \"Shiraz\" }\n]\n```"
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAiResponse
      });

      const result = await extractMemorialData('http://example.com', 'Content');

      expect(result).toEqual([{ name: 'Markdown User', city: 'Shiraz' }]);
    });

    it('throws when AI returns invalid JSON format', async () => {
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: "This is not json."
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAiResponse
      });

      await expect(extractMemorialData('http://example.com', 'Content')).rejects.toThrow(/invalid format/);
    });

    it('throws when AI service fails to respond (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({})
      });

      await expect(extractMemorialData('http://example.com', 'Content')).rejects.toThrow(/AI Service Error: Internal Server Error/);
    });

    it('throws Auth Error on 401 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API Key' } })
      });

      await expect(extractMemorialData('http://example.com', 'Content')).rejects.toThrow(/AI Auth Error/);
    });
  });

  describe('Jina Reader Flow (no content provided)', () => {
    it('fetches URL via Jina Reader when no content is provided', async () => {
      mockFetch
        .mockResolvedValueOnce({ // Jina Reader response
          ok: true,
          text: async () => 'A'.repeat(101) + 'Fetched content from Jina Reader about Test Victim.'
        })
        .mockResolvedValueOnce({ // OpenRouter response
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify([{ name: 'Jina User' }]) } }]
          })
        });

      const result = await extractMemorialData('http://example.com/post');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://r.jina.ai/http://example.com/post', expect.any(Object));
      expect(result).toEqual([{ name: 'Jina User' }]);
    });

    it('modifies Instagram URLs for Jina Reader', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, text: async () => 'A'.repeat(101) + 'Valid IG Content' })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '[]' } }] }) });

      await extractMemorialData('https://instagram.com/p/xyz/');

      expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://r.jina.ai/https://instagram.com/p/xyz/embed/captioned/', expect.any(Object));
    });

    it('modifies Telegram URLs for Jina Reader', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, text: async () => 'A'.repeat(101) + 'Valid TG Content' })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '[]' } }] }) });

      await extractMemorialData('https://t.me/channel/123');

      expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://r.jina.ai/https://t.me/channel/123?embed=1', expect.any(Object));
    });

    it('throws an error if Jina Reader fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      });

      await expect(extractMemorialData('http://example.com')).rejects.toThrow(/Failed to read the source URL. Jina said: Not Found/);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Should not call OpenRouter
    });

    it('throws ai.error.blocked if content is too short', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Too short'
      });

      await expect(extractMemorialData('http://example.com')).rejects.toThrow(/ai.error.blocked/);
    });

    it('throws ai.error.blocked if content indicates Instagram login wall', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'A'.repeat(100) + 'Login • Instagram'
      });

      await expect(extractMemorialData('http://example.com')).rejects.toThrow(/ai.error.blocked/);
    });
  });
});

describe('geocodeLocation', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let geocodeLocation: (city: string, location: string) => Promise<{ lat: number; lon: number } | null>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'valid-test-key');
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    vi.spyOn(console, 'error').mockImplementation(() => {});

    const aiModule = await import('../ai');
    geocodeLocation = aiModule.geocodeLocation;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = globalFetch;
    vi.clearAllMocks();
  });

  it('successfully geocodes when both city and location query yield results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '35.6892', lon: '51.3890' }]
    });

    const result = await geocodeLocation('Tehran', 'Azadi Square');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('Azadi%20Square%2C%20Tehran%2C%20Iran'),
      expect.any(Object)
    );
    expect(result).toEqual({ lat: 35.6892, lon: 51.3890 });
  });

  it('falls back to city only query when location query yields no results', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [] // First call (location + city) returns empty
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ lat: '35.6', lon: '51.3' }] // Second call (city only) returns data
      });

    const result = await geocodeLocation('Tehran', 'Unknown Small Street');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ lat: 35.6, lon: 51.3 });
  });

  it('returns null when neither query yields results', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

    const result = await geocodeLocation('Unknown City', 'Unknown Street');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toBeNull();
  });

  it('returns null and logs error if initial geocoding request fails (not ok)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error'
    });

    const result = await geocodeLocation('Tehran', 'Azadi Square');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Geocoding Error:', expect.any(Error));
    expect(result).toBeNull();
  });

  it('returns null and logs error if fetch throws an exception', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await geocodeLocation('Tehran', 'Azadi Square');

    expect(console.error).toHaveBeenCalledWith('Geocoding Error:', expect.any(Error));
    expect(result).toBeNull();
  });
});

describe('translateMemorialData', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let translateMemorialData: (data: any) => Promise<any | null>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'valid-test-key');
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    vi.spyOn(console, 'error').mockImplementation(() => {});

    const aiModule = await import('../ai');
    translateMemorialData = aiModule.translateMemorialData;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = globalFetch;
    vi.clearAllMocks();
  });

  describe('API Key Validation', () => {
    it('returns null and logs error if API key is not set', async () => {
      vi.stubEnv('VITE_OPENROUTER_API_KEY', '');
      vi.resetModules();
      const newModule = await import('../ai');

      const result = await newModule.translateMemorialData({ name: 'Test' });
      expect(result).toBeNull();
    });

    it('returns null and logs error if API key is default placeholder', async () => {
      vi.stubEnv('VITE_OPENROUTER_API_KEY', 'sk-or-v1-...');
      vi.resetModules();
      const newModule = await import('../ai');

      const result = await newModule.translateMemorialData({ name: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('Translation Processing', () => {
    it('successfully translates data returning clean json', async () => {
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ name: 'Test', name_fa: 'تست' })
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAiResponse
      });

      const result = await translateMemorialData({ name: 'Test' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.any(Object));
      expect(result).toEqual({ name: 'Test', name_fa: 'تست' });
    });

    it('strips markdown wrapping and returns correct json', async () => {
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: "```json\n{\n  \"name\": \"Test\",\n  \"name_fa\": \"تست\"\n}\n```"
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAiResponse
      });

      const result = await translateMemorialData({ name: 'Test' });

      expect(result).toEqual({ name: 'Test', name_fa: 'تست' });
    });

    it('returns null and logs error if AI response is invalid json', async () => {
      const mockAiResponse = {
        choices: [
          {
            message: {
              content: "This is not valid json."
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAiResponse
      });

      const result = await translateMemorialData({ name: 'Test' });

      expect(result).toBeNull();
    });

    it('returns null and logs error if API fails (not ok)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await translateMemorialData({ name: 'Test' });

      expect(result).toBeNull();
    });
  });
});
