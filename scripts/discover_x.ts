/* eslint-disable no-console */
import { extractMemorialData } from '../src/modules/ai';
import { submitMemorial, fetchMemorials } from '../src/modules/dataService';

// Shared configuration and utilities
import { TARGETS, RELEVANCE_KEYWORDS, REQUEST_DELAY_MS } from './config/discoveryConfig';
import { loadHistory, saveHistory } from './config/historyManager';
import { fetchUrlContent, extractSocialUrls, isDirectContentLink } from './utils/urlHelpers';
import {
  isValidVictim,
  createMemorialEntry
} from './utils/victimProcessor';

/**
 * Script to automatically discover potential memorial posts on X (Twitter)
 * and add them to the Supabase database for review.
 */

interface DiscoveryStats {
  successCount: number;
  skipCount: number;
}

/**
 * Searches a target URL for social media post URLs
 */
async function searchTarget(targetUrl: string): Promise<Set<string>> {
  try {
    console.log(`Searching target: ${targetUrl}`);

    const content = await fetchUrlContent(targetUrl);
    if (!content) {
      console.error(`Failed to fetch ${targetUrl}: No content returned`);
      return new Set();
    }

    const urls = extractSocialUrls(content);
    return new Set(urls);
  } catch (error) {
    console.error(`Error searching ${targetUrl}:`, error);
    return new Set();
  }
}

/**
 * Checks if content contains relevant keywords
 */
function hasRelevantKeywords(content: string, url: string): boolean {
  // For known relevant channels, be more lenient
  if (isRememberThoseNames(url)) {
    return true;
  }
  return RELEVANCE_KEYWORDS.some(keyword =>
    content.toLowerCase().includes(keyword.toLowerCase())
  );
}

/**
 * Checks if URL is from Remember Their Names
 */
function isRememberThoseNames(url: string): boolean {
  return url.includes('RememberTheirNames/');
}

/**
 * Processes a single URL for memorial data
 */
async function processUrl(
  url: string,
  stats: DiscoveryStats
): Promise<void> {
  try {
    console.log(`Processing: ${url}`);

    // Fetch content
    const fetchUrl = url.includes('t.me/') ? `${url}?embed=1` : url;
    const content = await fetchUrlContent(fetchUrl);

    if (!content) {
      console.log(`Skipping (could not fetch content): ${url}`);
      stats.skipCount++;
      return;
    }

    // Check for relevance keywords
    if (!hasRelevantKeywords(content, url)) {
      console.log(`Skipping (no relevant keywords found): ${url}`);
      stats.skipCount++;
      return;
    }

    // Extract data using AI
    const victims = await extractMemorialData(url, content);

    if (!victims || victims.length === 0) {
      console.log(`Skipping (no victims found): ${url}`);
      stats.skipCount++;
      return;
    }

    // Process each victim concurrently in batches
    const CONCURRENCY_LIMIT = 5;
    for (let i = 0; i < victims.length; i += CONCURRENCY_LIMIT) {
      const batch = victims.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.all(batch.map(async (data) => {
        if (!isValidVictim(data)) {
          console.log(`Skipping victim (invalid name) in: ${url}`);
          stats.skipCount++;
          return;
        }

        // Create memorial entry (ensures photo internally)
        const entry = await createMemorialEntry(data, url);

        // Submit to database
        const result = await submitMemorial(entry);

        if (result.success) {
          console.log(`Successfully added/merged: ${data.name}`);
          stats.successCount++;
        } else {
          console.error(`Failed to submit ${data.name}: ${result.error}`);
        }
      }));
    }
  } catch (error) {
    console.error(`Error processing ${url}:`, error);
  }
}

/**
 * Collects all unique URLs from targets
 */
async function collectUrls(
  targets: readonly string[],
  existingUrls: Set<string>,
  history: Set<string>
): Promise<Set<string>> {
  const allUrls = new Set<string>();

  for (const target of targets) {
    // Check if the target itself is a direct article link
    if (isDirectContentLink(target)) {
      if (!existingUrls.has(target) && !history.has(target)) {
        allUrls.add(target);
      }
      continue;
    }

    // Search target for URLs
    const urls = await searchTarget(target);
    urls.forEach(url => {
      if (!existingUrls.has(url) && !history.has(url)) {
        allUrls.add(url);
      }
    });
  }

  return allUrls;
}

/**
 * Main discovery process
 */
async function runDiscovery(): Promise<void> {
  console.log('--- Starting X Discovery Process ---');

  // Load history of processed URLs
  const history = loadHistory();
  console.log(`Loaded ${history.size} previously processed URLs.`);

  // Get already existing memorials to avoid duplicates
  const existingMemorials = await fetchMemorials(true);
  const existingUrls = new Set(
    existingMemorials.flatMap(m => [
      m.media?.xPost,
      m.media?.telegramPost,
      ...(m.references?.map(r => r.url) || [])
    ]).filter(Boolean) as string[]
  );

  console.log(`Found ${existingMemorials.length} existing entries in database.`);

  // Collect status URLs from all targets
  const allUrls = await collectUrls(TARGETS, existingUrls, history);
  console.log(`Found ${allUrls.size} new potential status URLs.`);

  // Process each URL
  const stats: DiscoveryStats = { successCount: 0, skipCount: 0 };

  for (const url of allUrls) {
    // Mark as processed in history
    history.add(url);

    await processUrl(url, stats);

    // Add delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
  }

  // Save history for next run
  saveHistory(history);

  console.log('--- Discovery Finished ---');
  console.log(`Added/Merged: ${stats.successCount}`);
  console.log(`Skipped: ${stats.skipCount}`);
}

// Run if called directly
runDiscovery().catch(console.error);
