import { extractMemorialData } from '../../src/modules/ai';
import { submitMemorial, fetchMemorials } from '../../src/modules/dataService';
import type { MemorialEntry } from '../../src/modules/types';

interface ProcessingStats {
  successCount: number;
  skipCount: number;
  errorCount: number;
}

const PERSIAN_WIKI_PAGES = [
  {
    name: '1404_victims',
    url: 'https://fa.wikipedia.org/wiki/%D9%81%D9%87%D8%B1%D8%B3%D8%AA_%D8%AF%D9%88%D9%84%D8%AA%DB%8C_%DA%A9%D8%B4%D8%AA%D9%87%E2%80%8C%D8%B4%D8%AF%DA%AF%D8%A7%D9%86_%D8%A7%D8%B9%D8%AA%D8%B1%D8%A7%D8%B6%D8%A7%D8%AA_%D8%AF%DB%8C_%DB%B1%DB%B4%DB%B0%DB%B4_%D8%A7%DB%8C%D8%B1%D8%A7%D9%86',
    title: 'List of 1404 victims'
  },
  {
    name: '1401_khuzestan',
    url: 'https://fa.wikipedia.org/wiki/%DA%A9%D8%B4%D8%AA%D9%87%E2%80%8C%D8%B4%D8%AF%DA%AF%D8%A7%D9%86_%D8%AE%DB%8C%D8%B2%D8%B4_%DB%B1%DB%B4%DB%B0%DB%B1_%D8%A7%DB%8C%D8%B1%D8%A7%D9%86',
    title: '1401 Khuzestan protests victims'
  }
];

async function fetchWikipediaContent(url: string): Promise<string | null> {
  try {
    const readerUrl = `https://r.jina.ai/${url}`;
    
    const response = await fetch(readerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch Wikipedia page: ${response.status} ${response.statusText}`);
      
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
    console.error('Error fetching Wikipedia page:', error);
    return null;
  }
}

async function extractVictimsFromWikipediaPage(url: string, pageName: string): Promise<Partial<MemorialEntry>[]> {
  console.log(`Fetching Wikipedia page: ${pageName}`);
  
  const content = await fetchWikipediaContent(url);
  if (!content) {
    console.log(`Failed to fetch content for: ${pageName}`);
    return [];
  }

  try {
    const victims = await extractMemorialData(url, content);
    
    if (!victims || victims.length === 0) {
      console.log(`No victims found in Wikipedia page: ${pageName}`);
      return [];
    }

    return victims.map((victim, _index) => ({
      ...victim,
      references: [
        {
          label: `Wikipedia: ${pageName}`,
          url
        }
      ]
    }));
  } catch (error) {
    console.error(`Error processing Wikipedia page ${pageName}:`, error);
    return [];
  }
}

async function processWikipediaVictim(
  victim: Partial<MemorialEntry>,
  memorialUrls: Set<string>,
  stats: ProcessingStats
): Promise<void> {
  const wikiUrl = victim.references?.[0]?.url;
  
  if (wikiUrl && urlExistsInMemorials(wikiUrl, memorialUrls)) {
    console.log(`Skipping (already in database): ${wikiUrl}`);
    stats.skipCount++;
    return;
  }

  if (!victim.name) {
    console.log(`Skipping invalid victim`);
    stats.skipCount++;
    return;
  }

  try {
    const result = await submitMemorial(victim);

    if (result.success) {
      if (result.merged) {
        console.log(`Match found for "${victim.name}". Added Wikipedia as reference.`);
      } else {
        console.log(`Successfully added new entry (unverified): ${victim.name}`);
      }
      stats.successCount++;
    } else {
      if (result.error?.includes('already exist')) {
        console.log(`Reference already exists for ${victim.name}.`);
        stats.skipCount++;
      } else {
        console.error(`Failed to submit ${victim.name}: ${result.error}`);
        stats.errorCount++;
      }
    }
  } catch (error) {
    console.error(`Error processing ${victim.name}:`, error);
    stats.errorCount++;
  }
}

function urlExistsInMemorials(url: string, memorialUrls: Set<string>): boolean {
  return memorialUrls.has(url);
}

async function scrapeWikipediaPages(): Promise<void> {
  console.log('📚 Starting Wikipedia Scraping...\n');

  const stats: ProcessingStats = { successCount: 0, skipCount: 0, errorCount: 0 };
  
  const existingMemorials = await fetchMemorials(true);
  const memorialUrls = new Set(
    existingMemorials.flatMap(m => {
      const refs = m.references?.map(r => r.url) || [];
      return refs;
    }).filter(Boolean) as string[]
  );

  for (const page of PERSIAN_WIKI_PAGES) {
    console.log(`\n--- Processing: ${page.title} ---`);
    
    const victims = await extractVictimsFromWikipediaPage(page.url, page.name);
    
    for (const victim of victims) {
      await processWikipediaVictim(victim, memorialUrls, stats);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n--- Wikipedia Scraping Finished ---');
  console.log(`Added/Merged: ${stats.successCount}`);
  console.log(`Skipped: ${stats.skipCount}`);
  console.log(`Errors: ${stats.errorCount}`);
}

async function main(): Promise<void> {
  await scrapeWikipediaPages();
}

main().catch(console.error);
