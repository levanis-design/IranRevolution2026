/**
 * URL helper utilities for discovery scripts
 */

import { JINA_AI_READER_URL } from '../config/discoveryConfig';

export type UrlType = 'x' | 'telegram' | 'other';

export interface ParsedUrl {
  url: string;
  type: UrlType;
  platform: string;
}

/**
 * Determines the type and platform of a URL
 */
export function parseUrlType(url: string): ParsedUrl {
  const cleanUrl = url.replace('twitter.com', 'x.com');

  if (cleanUrl.includes('x.com') || cleanUrl.includes('twitter.com')) {
    return { url: cleanUrl, type: 'x', platform: 'X' };
  }
  if (cleanUrl.includes('t.me/')) {
    return { url: cleanUrl, type: 'telegram', platform: 'Telegram' };
  }
  return { url: cleanUrl, type: 'other', platform: 'Other' };
}

/**
 * Checks if a URL is a direct content link (not a search/profile page)
 */
export function isDirectContentLink(url: string): boolean {
  return url.includes('/status/') || url.includes('/news/') || url.includes('/article/');
}

/**
 * Converts URL for fetching content (adds embed for Telegram, etc.)
 */
export function getUrlForFetching(url: string): string {
  return url.includes('t.me/') ? `${url}?embed=1` : url;
}

/**
 * Fetches content from a URL using jina.ai reader
 */
export async function fetchUrlContent(url: string): Promise<string> {
  try {
    const readerUrl = `${JINA_AI_READER_URL}/${url}`;
    const response = await fetch(readerUrl, {
      headers: { 'X-No-Cache': 'true' }
    });

    if (!response.ok) return '';
    return await response.text();
  } catch (error) {
    return '';
  }
}

/**
 * Extracts all X/Twitter status URLs from content
 */
export function extractXStatusUrls(content: string): string[] {
  const regex = /https:\/\/(x|twitter)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/g;
  const matches = content.match(regex) || [];
  return [...new Set(matches.map(url => url.replace('twitter.com', 'x.com')))];
}

/**
 * Extracts all Telegram post URLs from content
 */
export function extractTelegramUrls(content: string): string[] {
  const regex = /https:\/\/t\.me\/[a-zA-Z0-9_]+\/[0-9]+/g;
  const matches = content.match(regex) || [];
  return [...new Set(matches)];
}

/**
 * Extracts all social media post URLs (X and Telegram) from content
 */
export function extractSocialUrls(content: string): string[] {
  const xUrls = extractXStatusUrls(content);
  const telegramUrls = extractTelegramUrls(content);
  return [...new Set([...xUrls, ...telegramUrls])];
}
