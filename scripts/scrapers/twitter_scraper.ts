import { extractMemorialData } from '../../src/modules/ai';
import { submitMemorial, fetchMemorials } from '../../src/modules/dataService';
import { extractSocialImage } from '../../src/modules/imageExtractor';
import type { MemorialEntry } from '../../src/modules/types';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const POSITION_FILE = join(process.cwd(), '.scrape-twitter-position.json');

export interface ProcessingStats {
  successCount: number;
  skipCount: number;
  errorCount: number;
}

interface TwitterAccount {
  username: string;
  enabled: boolean;
}

interface PositionData {
  [account: string]: string;
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

function getLastScrapedTweet(account: string): string {
  const positions = loadPosition();
  return positions[account] ?? '';
}

function updateLastScrapedTweet(account: string, tweetId: string): void {
  const positions = loadPosition();
  positions[account] = tweetId;
  savePosition(positions);
}

const TWITTER_ACCOUNTS: TwitterAccount[] = [
  {
    username: 'IranRevolution',
    enabled: true
  },
  {
    username: 'IranHumanRights',
    enabled: true
  },
  {
    username: '1500tasvir',
    enabled: true
  },
  {
    username: 'RememberTheirNames',
    enabled: false
  },
  {
    username: 'Vatan_pahlavi',
    enabled: true
  }
];

// Nitter instances to try in order (nitter.net is dead)
const NITTER_INSTANCES = [
  'nitter.cz',
  'nitter.net',
  'nitter.privacydev.net',
];

async function fetchFromNitter(path: string): Promise<string | null> {
  for (const instance of NITTER_INSTANCES) {
    try {
      // Try direct fetch first (Nitter is SSR, no JS needed)
      const directRes = await fetch(`https://${instance}${path}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (directRes.ok) {
        const text = await directRes.text();
        // Skip bot-check pages
        if (text.includes('tweet-link') || text.includes('/status/')) return text;
      }

      // Fallback: try via Jina Reader
      const jinaRes = await fetch(`https://r.jina.ai/https://${instance}${path}`, {
        headers: { 'X-No-Cache': 'true', 'Accept': 'text/plain' },
        signal: AbortSignal.timeout(20000),
      });
      if (jinaRes.ok) {
        const text = await jinaRes.text();
        if (text.includes('/status/') && !text.includes('CAPTCHA')) return text;
      }
    } catch {
      // try next instance
    }
  }
  return null;
}

async function fetchTwitterTimeline(username: string, _lastTweetId?: string): Promise<string[]> {
  try {
    const content = await fetchFromNitter(`/${username}`);
    if (!content) {
      console.error(`All Nitter instances failed for @${username}`);
      return [];
    }

    // Extract tweet IDs from HTML or Jina Markdown output
    const tweetRegex = /\/(?:\w+)\/status\/(\d+)/g;
    const matches = [...content.matchAll(tweetRegex)];
    const tweetIds = [...new Set(matches.map(m => m[1]))];

    return tweetIds;
  } catch (error) {
    console.error(`Error fetching Twitter timeline for @${username}:`, error);
    return [];
  }
}

async function fetchTwitterTweet(tweetId: string): Promise<string | null> {
  try {
    const content = await fetchFromNitter(`/i/status/${tweetId}`);
    if (!content) {
      console.error(`Failed to fetch tweet ${tweetId} from all Nitter instances`);
    }
    return content;
  } catch (error) {
    console.error(`Error fetching tweet ${tweetId}:`, error);
    return null;
  }
}

export async function processTwitterTweet(
  tweetId: string,
  username: string,
  memorialUrls: Set<string>,
  stats: ProcessingStats
): Promise<void> {
  const tweetUrl = `https://x.com/${username}/status/${tweetId}`;
  
  if (urlExistsInMemorials(tweetUrl, memorialUrls)) {
    console.log(`Skipping (already in database): ${tweetUrl}`);
    stats.skipCount++;
    return;
  }

  try {
    console.log(`Processing tweet: ${tweetUrl}`);

    const content = await fetchTwitterTweet(tweetId);
    
    if (!content || content.length < 100) {
      console.log(`Skipping (empty or blocked): ${tweetUrl}`);
      stats.skipCount++;
      return;
    }

    const victims = await extractMemorialData(tweetUrl, content);

    if (!victims || victims.length === 0) {
      console.log(`No victims found in tweet: ${tweetUrl}`);
      stats.skipCount++;
      return;
    }

    const imageUrl = await extractSocialImage(tweetUrl);

    const chunkSize = 5;
    for (let i = 0; i < victims.length; i += chunkSize) {
      const chunk = victims.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (data) => {
          if (!data.name) {
            console.log(`Skipping invalid victim in tweet: ${tweetUrl}`);
            return;
          }

          const entry: Partial<MemorialEntry> = {
            ...data,
            media: imageUrl ? { photo: imageUrl } : undefined,
            references: [
              {
                label: `@${username} (Twitter/X)`,
                url: tweetUrl
              }
            ]
          };

          const result = await submitMemorial(entry);

          if (result.success) {
            if (result.merged) {
              console.log(`Match found for "${data.name}". Added Twitter as reference.`);
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
        })
      );
    }

    updateLastScrapedTweet(username, tweetId);
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    const err = error as { message?: string };
    console.error(`Error processing tweet ${tweetId}:`, err.message || error);
    stats.errorCount++;
  }
}

function urlExistsInMemorials(url: string, memorialUrls: Set<string>): boolean {
  return memorialUrls.has(url);
}

async function scrapeTwitterAccount(account: TwitterAccount, resume: boolean): Promise<void> {
  console.log(`\n--- Starting Twitter Scrape: @${account.username} ---`);
  
  const stats: ProcessingStats = { successCount: 0, skipCount: 0, errorCount: 0 };
  
  const existingMemorials = await fetchMemorials(true);
  const memorialUrls = new Set(
    existingMemorials.flatMap(m => {
      const refs = m.references?.map(r => r.url) || [];
      return refs;
    }).filter(Boolean) as string[]
  );

  const lastTweetId = resume ? getLastScrapedTweet(account.username) : undefined;
  if (resume && lastTweetId) {
    console.log(`Resuming from tweet: ${lastTweetId}`);
  }

  const tweetIds = await fetchTwitterTimeline(account.username, lastTweetId);
  console.log(`Found ${tweetIds.length} tweets to process`);

  for (const tweetId of tweetIds) {
    if (resume && lastTweetId && tweetId === lastTweetId) {
      continue;
    }
    await processTwitterTweet(tweetId, account.username, memorialUrls, stats);
  }

  console.log(`--- @${account.username} Scrape Finished ---`);
  console.log(`Added/Merged: ${stats.successCount}`);
  console.log(`Skipped: ${stats.skipCount}`);
  console.log(`Errors: ${stats.errorCount}`);
}

async function scrapeAllAccounts(resume: boolean): Promise<void> {
  console.log('🐦 Starting Twitter/X Scraping for Multiple Accounts...\n');

  for (const account of TWITTER_ACCOUNTS) {
    if (!account.enabled) {
      console.log(`⏭️  Skipping disabled account: @${account.username}`);
      continue;
    }

    await scrapeTwitterAccount(account, resume);
  }

  console.log('\n✅ All Twitter Scraping Completed!');
}

function parseArgs(): { account?: string; resume: boolean } | null {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const accountArg = args.find(a => !a.startsWith('--'));
  
  if (accountArg && !TWITTER_ACCOUNTS.some(a => a.username === accountArg)) {
    console.error(`Unknown account: ${accountArg}`);
    console.log(`Available accounts: ${TWITTER_ACCOUNTS.map(a => a.username).join(', ')}`);
    return null;
  }

  return { account: accountArg, resume };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args) return;

  if (args.account) {
    const account = TWITTER_ACCOUNTS.find(a => a.username === args.account);
    if (account) {
      await scrapeTwitterAccount(account, args.resume);
    }
  } else {
    await scrapeAllAccounts(args.resume);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
