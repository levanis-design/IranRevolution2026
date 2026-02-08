/* eslint-disable no-console */
import { extractMemorialData } from '../src/modules/ai';
import { submitMemorial, fetchMemorials } from '../src/modules/dataService';
import type { MemorialEntry } from '../src/modules/types';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Shared configuration and utilities
import { MAX_CONSECUTIVE_EMPTY } from './config/discoveryConfig';
import {
  isValidVictim,
  createTelegramMemorialEntry
} from './utils/victimProcessor';

const POSITION_FILE = join(process.cwd(), '.scrape-position.json');

/**
 * Script to scrape a range of Telegram messages from a specific channel.
 * Usage: npx tsx --env-file=.env scripts/scrape_telegram_range.ts <channel> <startId> <endId> [--resume]
 * Example: npx tsx --env-file=.env scripts/scrape_telegram_range.ts RememberTheirNames 1 1580
 * Example (resume): npx tsx --env-file=.env scripts/scrape_telegram_range.ts RememberTheirNames 1 5000 --resume
 */

interface ProcessingStats {
  successCount: number;
  skipCount: number;
  errorCount: number;
}

interface RangeConfig {
  channel: string;
  startId: number;
  endId: number;
  step: number;
  resume: boolean;
}

interface PositionData {
  [channel: string]: number;
}

function loadPosition(): PositionData {
  if (existsSync(POSITION_FILE)) {
    try {
      const data = readFileSync(POSITION_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return {};
}

function savePosition(positionData: PositionData): void {
  writeFileSync(POSITION_FILE, JSON.stringify(positionData, null, 2));
}

function getLastScrapedId(channel: string): number | null {
  const positions = loadPosition();
  return positions[channel] ?? null;
}

function updateLastScrapedId(channel: string, id: number): void {
  const positions = loadPosition();
  positions[channel] = id;
  savePosition(positions);
}

/**
 * Parses command line arguments for range configuration
 */
function parseRangeArgs(): RangeConfig | null {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: npx tsx --env-file=.env scripts/scrape_telegram_range.ts <channel> <startId> <endId> [--resume]');
    console.log('Example: npx tsx --env-file=.env scripts/scrape_telegram_range.ts RememberTheirNames 1 1580');
    console.log('Resume: npx tsx --env-file=.env scripts/scrape_telegram_range.ts RememberTheirNames 1 5000 --resume');
    return null;
  }

  const channel = args[0];
  const startId = parseInt(args[1], 10);
  const endId = parseInt(args[2], 10);
  const resume = args.includes('--resume');

  if (isNaN(startId) || isNaN(endId)) {
    console.error('Error: startId and endId must be valid numbers');
    return null;
  }

  const step = startId <= endId ? 1 : -1;
  return { channel, startId, endId, step, resume };
}

/**
 * Checks if a memorial with the given URL already exists in the database
 */
function urlExistsInMemorials(url: string, memorialUrls: Set<string>): boolean {
  return memorialUrls.has(url);
}

/**
 * Processes a single victim entry
 */
async function processVictim(
  data: Partial<MemorialEntry>,
  url: string,
  channel: string,
  stats: ProcessingStats
): Promise<void> {
  if (!isValidVictim(data)) {
    console.log(`Skipping victim (invalid name) in: ${url}`);
    stats.skipCount++;
    return;
  }

  // Prepare memorial entry (ensures photo internally)
  const entry = await createTelegramMemorialEntry(data, url, channel);

  // Submit to database
  const result = await submitMemorial(entry);

  if (result.success) {
    if (result.merged) {
      console.log(`Match found for "${data.name}". Added Telegram as reference.`);
    } else {
      console.log(`Successfully added new entry (unverified): ${data.name}`);
    }
    stats.successCount++;
  } else {
    if (result.error?.includes('already exist')) {
      console.log(`Reference already exists for ${data.name}.`);
      stats.skipCount++;
    } else {
      console.error(`Failed to submit ${data.name}: ${result.error}`);
      stats.errorCount++;
    }
  }
}

/**
 * Processes a single Telegram post URL
 */
async function processTelegramPost(
  url: string,
  memorialUrls: Set<string>,
  channel: string,
  stats: ProcessingStats
): Promise<boolean> {
  if (urlExistsInMemorials(url, memorialUrls)) {
    console.log(`Skipping (already in database): ${url}`);
    stats.skipCount++;
    return false; // Reset counter on found/existing
  }

  try {
    console.log(`Processing: ${url}`);

    // Extract data using AI
    const victims = await extractMemorialData(url);

    if (!victims || victims.length === 0) {
      console.log(`Skipping (no victims found or empty post): ${url}`);
      return true; // Signal that we found no victims (potentially empty)
    }

    // Process each victim
    for (const data of victims) {
      await processVictim(data, url, channel, stats);
    }

    return false; // Found victims - reset counter
  } catch (error) {
    const err = error as { message?: string };
    if (err.message === 'ai.error.blocked') {
      console.log(`Skipping (content blocked or empty): ${url}`);
      stats.skipCount++;
    } else {
      console.error(`Error processing ${url}:`, err.message || error);
      stats.errorCount++;
    }
    return false; // Reset counter on errors
  }
}

/**
 * Scrapes a range of Telegram messages
 */
async function scrapeRange(): Promise<void> {
  const config = parseRangeArgs();
  if (!config) return;

  const { channel, startId, endId, step, resume } = config;
  
  let actualStartId = startId;
  
  if (resume) {
    const lastScraped = getLastScrapedId(channel);
    if (lastScraped !== null) {
      actualStartId = step === 1 ? lastScraped + 1 : lastScraped - 1;
      console.log(`Resuming from last scraped ID: ${lastScraped}`);
      console.log(`Starting from: ${actualStartId}`);
    } else {
      console.log('No previous position found. Starting from beginning.');
    }
  }
  
  console.log(`--- Starting Telegram Scrape: @${channel} from ${actualStartId} to ${endId} ---`);

  // Get existing memorials to avoid duplicates
  const existingMemorials = await fetchMemorials(true);
  const memorialUrls = new Set(
    existingMemorials.flatMap(m => {
      const refs = m.references?.map(r => r.url) || [];
      if (m.media?.telegramPost) {
        refs.push(m.media.telegramPost);
      }
      return refs;
    }).filter(Boolean) as string[]
  );

  const stats: ProcessingStats = { successCount: 0, skipCount: 0, errorCount: 0 };
  let consecutiveEmpty = 0;

  // Loop through range
  for (let id = actualStartId; step === 1 ? id <= endId : id >= endId; id += step) {
    const url = `https://t.me/${channel}/${id}`;

    const wasEmpty = await processTelegramPost(url, memorialUrls, channel, stats);

    // Update position tracking
    if (!wasEmpty && stats.successCount > 0 || stats.skipCount > 0) {
      updateLastScrapedId(channel, id);
    }

    // Track consecutive empty posts
    consecutiveEmpty = wasEmpty ? consecutiveEmpty + 1 : 0;

    if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
      console.log(`Reached limit of ${MAX_CONSECUTIVE_EMPTY} consecutive empty posts. Stopping early.`);
      break;
    }

    // Small delay to be respectful
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('--- Scrape Finished ---');
  console.log(`Added/Merged: ${stats.successCount}`);
  console.log(`Skipped: ${stats.skipCount}`);
  console.log(`Errors: ${stats.errorCount}`);
}

// Run if called directly
scrapeRange().catch(console.error);
