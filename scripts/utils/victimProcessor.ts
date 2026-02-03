/**
 * Victim processing utilities shared across discovery scripts
 */

import type { MemorialEntry } from '../../src/modules/types';
import { extractSocialImage } from '../../src/modules/imageExtractor';
import { REMEMBER_THEIR_NAMES } from '../config/discoveryConfig';
import { parseUrlType } from './urlHelpers';

export interface ProcessingStats {
  successCount: number;
  skipCount: number;
  errorCount?: number;
}

/**
 * Validates if a victim data object has required information
 */
export function isValidVictim(data: Partial<MemorialEntry>): boolean {
  return !!(data && data.name && data.name !== 'Full Name' && data.name !== '');
}

/**
 * Checks if a URL is from Remember Their Names source
 */
export function isRememberTheirNamesSource(url: string): boolean {
  return url.includes(`${REMEMBER_THEIR_NAMES}/`);
}

/**
 * Ensures a victim has a photo, extracting from URL if needed
 */
export async function ensurePhoto(data: Partial<MemorialEntry>, url: string): Promise<string> {
  if (data.media?.photo) return data.media.photo;
  return await extractSocialImage(url) || '';
}

/**
 * Creates a memorial entry from extracted data
 */
export async function createMemorialEntry(
  data: Partial<MemorialEntry>,
  url: string
): Promise<Partial<MemorialEntry>> {
  const { type, platform } = parseUrlType(url);

  // Ensure we have an image
  const photo = await ensurePhoto(data, url);

  return {
    ...data,
    verified: isRememberTheirNamesSource(url),
    media: {
      xPost: type === 'x' ? url : undefined,
      telegramPost: type === 'telegram' ? url : undefined,
      photo
    },
    references: [
      {
        label: `${platform} Post`,
        url: url
      }
    ]
  };
}

/**
 * Creates a memorial entry for Telegram scraping with merge support
 */
export async function createTelegramMemorialEntry(
  data: Partial<MemorialEntry>,
  url: string,
  channel: string
): Promise<Partial<MemorialEntry>> {
  // Ensure we have an image
  const photo = await ensurePhoto(data, url);

  return {
    ...data,
    verified: channel === REMEMBER_THEIR_NAMES,
    media: {
      ...(data.media || {}),
      photo: photo || data.media?.photo || '',
      telegramPost: url
    },
    references: [
      ...(data.references || []),
      { label: 'Telegram', url: url }
    ]
  };
}

/**
 * Processes a single URL and extracts victim data
 */
export async function processVictimData(
  victims: Partial<MemorialEntry>[],
  url: string,
  submitFn: (entry: Partial<MemorialEntry>) => Promise<{ success: boolean; merged?: boolean; error?: string }>,
  stats: ProcessingStats
): Promise<void> {
  for (const data of victims) {
    if (!isValidVictim(data)) {
      console.log(`Skipping victim (invalid name) in: ${url}`);
      stats.skipCount++;
      continue;
    }

    const entry = await createMemorialEntry(data, url);
    const result = await submitFn(entry);

    if (result.success) {
      console.log(`Successfully added/merged: ${data.name}`);
      stats.successCount++;
    } else {
      console.error(`Failed to submit ${data.name}: ${result.error}`);
      stats.errorCount = (stats.errorCount || 0) + 1;
    }
  }
}
