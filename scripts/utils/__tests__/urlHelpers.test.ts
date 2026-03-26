import { describe, it, expect } from 'vitest';
import { extractXStatusUrls, isDirectContentLink, parseUrlType } from '../urlHelpers';

describe('urlHelpers', () => {
  describe('extractXStatusUrls', () => {
    it('should extract valid x.com status URLs', () => {
      const content = 'Check out this post: https://x.com/user_123/status/1234567890';
      const result = extractXStatusUrls(content);
      expect(result).toEqual(['https://x.com/user_123/status/1234567890']);
    });

    it('should extract valid twitter.com status URLs and convert them to x.com', () => {
      const content = 'Old tweet: https://twitter.com/SomeUser/status/987654321';
      const result = extractXStatusUrls(content);
      expect(result).toEqual(['https://x.com/SomeUser/status/987654321']);
    });

    it('should extract multiple URLs', () => {
      const content = `
        Here is one: https://x.com/user1/status/111
        And another: https://twitter.com/user2/status/222
      `;
      const result = extractXStatusUrls(content);
      expect(result).toEqual([
        'https://x.com/user1/status/111',
        'https://x.com/user2/status/222'
      ]);
    });

    it('should remove duplicate URLs, treating x.com and twitter.com as the same', () => {
      const content = `
        Link A: https://x.com/user1/status/111
        Link B: https://twitter.com/user1/status/111
        Link C: https://x.com/user1/status/111
      `;
      const result = extractXStatusUrls(content);
      expect(result).toEqual(['https://x.com/user1/status/111']);
    });

    it('should ignore non-status profile links', () => {
      const content = `
        Profile: https://x.com/user1
        Another Profile: https://twitter.com/user2
        Valid status: https://x.com/user1/status/123
      `;
      const result = extractXStatusUrls(content);
      expect(result).toEqual(['https://x.com/user1/status/123']);
    });

    it('should return empty array for content with no URLs', () => {
      const content = 'Just some text without any links.';
      const result = extractXStatusUrls(content);
      expect(result).toEqual([]);
    });

    it('should strip query parameters and hash fragments', () => {
      const content = `
        With params: https://x.com/user1/status/123?s=46&t=xyz
        With hash: https://twitter.com/user1/status/456#comment
      `;
      const result = extractXStatusUrls(content);
      expect(result).toEqual([
        'https://x.com/user1/status/123',
        'https://x.com/user1/status/456'
      ]);
    });

    it('should not match http or protocol-less links', () => {
      const content = `
        http://x.com/user1/status/123
        x.com/user1/status/456
        www.twitter.com/user1/status/789
      `;
      const result = extractXStatusUrls(content);
      expect(result).toEqual([]);
    });

    it('should handle usernames with different allowed characters', () => {
      const content = `
        Alphanumeric: https://x.com/user123/status/1
        With underscores: https://x.com/user_name/status/2
      `;
      const result = extractXStatusUrls(content);
      expect(result).toEqual([
        'https://x.com/user123/status/1',
        'https://x.com/user_name/status/2'
      ]);
    });
  });
});

describe('isDirectContentLink', () => {
  it('should return true for URLs containing /status/', () => {
    expect(isDirectContentLink('https://twitter.com/user/status/1234567890')).toBe(true);
    expect(isDirectContentLink('https://x.com/user/status/1234567890')).toBe(true);
  });

  it('should return true for URLs containing /news/', () => {
    expect(isDirectContentLink('https://example.com/news/article-title')).toBe(true);
  });

  it('should return true for URLs containing /article/', () => {
    expect(isDirectContentLink('https://example.com/article/123')).toBe(true);
  });

  it('should return false for URLs without specific paths', () => {
    expect(isDirectContentLink('https://twitter.com/user')).toBe(false);
    expect(isDirectContentLink('https://example.com/about')).toBe(false);
    expect(isDirectContentLink('https://t.me/somechannel')).toBe(false);
    expect(isDirectContentLink('')).toBe(false);
  });
});

describe('parseUrlType', () => {
  it('should identify x.com URLs', () => {
    const result = parseUrlType('https://x.com/username/status/123456');
    expect(result).toEqual({ url: 'https://x.com/username/status/123456', type: 'x', platform: 'X' });
  });

  it('should identify twitter.com URLs and replace them with x.com', () => {
    const result = parseUrlType('https://twitter.com/username/status/123456');
    expect(result).toEqual({ url: 'https://x.com/username/status/123456', type: 'x', platform: 'X' });
  });

  it('should identify t.me URLs', () => {
    const result = parseUrlType('https://t.me/channelname/1234');
    expect(result).toEqual({ url: 'https://t.me/channelname/1234', type: 'telegram', platform: 'Telegram' });
  });

  it('should categorize unknown platforms as other', () => {
    const result = parseUrlType('https://example.com/article/123');
    expect(result).toEqual({ url: 'https://example.com/article/123', type: 'other', platform: 'Other' });
  });
});
