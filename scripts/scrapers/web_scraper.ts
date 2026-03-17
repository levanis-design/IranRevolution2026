import { extractMemorialData } from '../../src/modules/ai';
import { submitMemorial, fetchMemorials } from '../../src/modules/dataService';
import type { MemorialEntry } from '../../src/modules/types';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const POSITION_FILE = join(process.cwd(), '.scrape-web-position.json');

interface ProcessingStats {
  successCount: number;
  skipCount: number;
  errorCount: number;
}

interface SourceConfig {
  name: string;
  baseUrl: string;
  urls: string[];
  enabled: boolean;
}

interface PositionData {
  [source: string]: number;
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

function getLastScrapedIndex(source: string): number {
  const positions = loadPosition();
  return positions[source] ?? 0;
}

function updateLastScrapedIndex(source: string, index: number): void {
  const positions = loadPosition();
  positions[source] = index;
  savePosition(positions);
}

const SOURCES: SourceConfig[] = [
  {
    name: 'iranvictims',
    baseUrl: 'https://iranvictims.com/',
    urls: [
      'https://iranvictims.com/'
    ],
    enabled: false // replaced by scripts/scrapers/iranvictims_csv.ts (CSV import)
  },
  {
    name: 'iranmassacrewatch',
    baseUrl: 'https://iranmassacrewatch.com/',
    urls: [
      'https://iranmassacrewatch.com/'
    ],
    enabled: true
  },
  {
    name: 'javidnaam',
    baseUrl: 'https://javidnaam.org/',
    urls: [
      'https://javidnaam.org/'
    ],
    enabled: true
  },
  {
    name: 'iraneyes',
    baseUrl: 'https://iraneyes.org/',
    urls: [
      'https://iraneyes.org/'
    ],
    enabled: true
  }
];

async function fetchWebContent(url: string): Promise<string | null> {
  try {
    const readerUrl = `https://r.jina.ai/${url}`;
    
    const response = await fetch(readerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      
      if (response.status === 401) {
        console.log('Jina AI returned 401. Trying with minimal headers...');
        const fallbackResponse = await fetch(readerUrl);
        if (fallbackResponse.ok) {
          return await fallbackResponse.text();
        }
      }
      
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

async function processWebUrl(
  url: string,
  sourceName: string,
  memorialUrls: Set<string>,
  stats: ProcessingStats
): Promise<void> {
  if (urlExistsInMemorials(url, memorialUrls)) {
    console.log(`Skipping (already in database): ${url}`);
    stats.skipCount++;
    return;
  }

  try {
    console.log(`Processing: ${url}`);

    const content = await fetchWebContent(url);
    
    if (!content || content.length < 100) {
      console.log(`Skipping (empty or blocked): ${url}`);
      stats.skipCount++;
      return;
    }

    const victims = await extractMemorialData(url, content);

    if (!victims || victims.length === 0) {
      console.log(`No victims found in: ${url}`);
      stats.skipCount++;
      return;
    }

    for (const data of victims) {
      if (!data.name) {
        console.log(`Skipping invalid victim in: ${url}`);
        continue;
      }

      const entry: Partial<MemorialEntry> = {
        ...data,
        references: [
          {
            label: sourceName.charAt(0).toUpperCase() + sourceName.slice(1),
            url
          }
        ]
      };

      const result = await submitMemorial(entry);

      if (result.success) {
        if (result.merged) {
          console.log(`Match found for "${data.name}". Added ${sourceName} as reference.`);
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

    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    const err = error as { message?: string };
    console.error(`Error processing ${url}:`, err.message || error);
    stats.errorCount++;
  }
}

function urlExistsInMemorials(url: string, memorialUrls: Set<string>): boolean {
  return memorialUrls.has(url);
}

async function scrapeWebSource(source: SourceConfig, resume: boolean): Promise<void> {
  console.log(`\n--- Starting Web Scrape: ${source.name} ---`);
  
  const stats: ProcessingStats = { successCount: 0, skipCount: 0, errorCount: 0 };
  
  let startIndex = 0;
  if (resume) {
    startIndex = getLastScrapedIndex(source.name);
    console.log(`Resuming from index ${startIndex}`);
  }
  
  const existingMemorials = await fetchMemorials(true);
  const memorialUrls = new Set(
    existingMemorials.flatMap(m => {
      const refs = m.references?.map(r => r.url) || [];
      return refs;
    }).filter(Boolean) as string[]
  );

  for (let i = startIndex; i < source.urls.length; i++) {
    const url = source.urls[i];
    await processWebUrl(url, source.name, memorialUrls, stats);
    updateLastScrapedIndex(source.name, i);
  }

  console.log(`--- ${source.name} Scrape Finished ---`);
  console.log(`Added/Merged: ${stats.successCount}`);
  console.log(`Skipped: ${stats.skipCount}`);
  console.log(`Errors: ${stats.errorCount}`);
}

async function scrapeAllSources(resume: boolean): Promise<void> {
  console.log('🌐 Starting Web Scraping for Multiple Sources...\n');

  for (const source of SOURCES) {
    if (!source.enabled) {
      console.log(`⏭️  Skipping disabled source: ${source.name}`);
      continue;
    }

    await scrapeWebSource(source, resume);
  }

  console.log('\n✅ All Web Scraping Completed!');
}

function parseArgs(): { source?: string; resume: boolean } | null {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const sourceArg = args.find(a => !a.startsWith('--'));
  
  if (sourceArg && !SOURCES.some(s => s.name === sourceArg)) {
    console.error(`Unknown source: ${sourceArg}`);
    console.log(`Available sources: ${SOURCES.map(s => s.name).join(', ')}`);
    return null;
  }

  return { source: sourceArg, resume };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args) return;

  if (args.source) {
    const source = SOURCES.find(s => s.name === args.source);
    if (source) {
      await scrapeWebSource(source, args.resume);
    }
  } else {
    await scrapeAllSources(args.resume);
  }
}

main().catch(console.error);
