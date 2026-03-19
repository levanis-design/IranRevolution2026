import { submitMemorial, enrichMemorial } from '../../src/modules/dataService';
import type { MemorialEntry } from '../../src/modules/types';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CSV_URL = 'https://iranvictims.com/victims.csv';
const POSITION_FILE = join(process.cwd(), '.scrape-web-position.json');
const SOURCE_KEY = 'iranvictims_csv';
const DELAY_MS = 300;
const DRY_RUN_LIMIT = 10;

// ============================================================================
// Position tracking (shared with web_scraper.ts pattern)
// ============================================================================

function loadPosition(): Record<string, number> {
  if (existsSync(POSITION_FILE)) {
    try {
      return JSON.parse(readFileSync(POSITION_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function savePosition(data: Record<string, number>): void {
  writeFileSync(POSITION_FILE, JSON.stringify(data, null, 2));
}

function getStartIndex(): number {
  return loadPosition()[SOURCE_KEY] ?? 0;
}

function updateIndex(index: number): void {
  const pos = loadPosition();
  pos[SOURCE_KEY] = index;
  savePosition(pos);
}

// ============================================================================
// CSV parsing (handles quoted fields and UTF-8/Persian text)
// ============================================================================

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));
  return { headers, rows };
}

// ============================================================================
// Row → MemorialEntry mapping
// ============================================================================

interface CSVRow {
  cardId: string;
  englishName: string;
  persianName: string;
  age: string;
  gender: string;
  location: string;
  date: string;
  status: string;
  sourceUrls: string;
  notes: string;
}

function mapHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    map[h.toLowerCase().trim()] = i;
  });
  return map;
}

function getField(row: string[], map: Record<string, number>, ...keys: string[]): string {
  for (const key of keys) {
    const idx = map[key];
    if (idx !== undefined && row[idx] !== undefined) {
      return row[idx].trim();
    }
  }
  return '';
}

function rowToCSVRow(row: string[], map: Record<string, number>): CSVRow {
  return {
    cardId: getField(row, map, 'card id', 'card_id', 'id'),
    englishName: getField(row, map, 'english name', 'name'),
    persianName: getField(row, map, 'persian name', 'persian name', 'name_fa'),
    age: getField(row, map, 'age'),
    gender: getField(row, map, 'gender'),
    location: getField(row, map, 'location of death', 'location', 'city'),
    date: getField(row, map, 'date of death', 'date'),
    status: getField(row, map, 'status'),
    sourceUrls: getField(row, map, 'source urls', 'source url', 'sources'),
    notes: getField(row, map, 'notes', 'description', 'bio'),
  };
}

function buildBio(csv: CSVRow): string {
  const parts: string[] = [];
  if (csv.age && csv.age !== '-' && csv.age !== '—') parts.push(`Age: ${csv.age}`);
  if (csv.gender) parts.push(`Gender: ${csv.gender}`);
  const prefix = parts.length > 0 ? parts.join(', ') + ' — ' : '';
  const notes = csv.notes ? (prefix + csv.notes) : '';
  return notes.slice(0, 200);
}

function labelFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('t.me') || host.includes('telegram')) return 'Telegram'
    if (host.includes('x.com') || host.includes('twitter.com')) return 'X (Twitter)'
    if (host.includes('instagram.com')) return 'Instagram'
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube'
    if (host.includes('facebook.com') || host.includes('fb.com')) return 'Facebook'
    if (host.includes('hengaw.net')) return 'Hengaw'
    if (host.includes('iranhr.net')) return 'IranHR'
    if (host.includes('amnesty.org')) return 'Amnesty International'
    if (host.includes('iranwire.com')) return 'IranWire'
    // Capitalize first segment of domain
    return host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1)
  } catch {
    return 'Source'
  }
}

function buildReferences(csv: CSVRow): { label: string; url: string }[] {
  const refs: { label: string; url: string }[] = [];

  // Card page reference
  if (csv.cardId) {
    refs.push({ label: 'Iran Victims', url: `https://iranvictims.com/card/${csv.cardId}` });
  }

  // Source URLs from the CSV field (may be comma/space separated)
  if (csv.sourceUrls) {
    const urls = csv.sourceUrls
      .split(/[\s,]+/)
      .map(u => u.trim())
      .filter(u => u.startsWith('http'));
    for (const url of urls) {
      refs.push({ label: labelFromUrl(url), url });
    }
  }

  return refs;
}

function csvRowToEntry(csv: CSVRow): Partial<MemorialEntry> | null {
  if (!csv.englishName) return null;

  return {
    name: csv.englishName,
    name_fa: csv.persianName || undefined,
    city: csv.location || 'Unknown',
    date: csv.date || undefined,
    bio: buildBio(csv) || undefined,
    references: buildReferences(csv),
  };
}

// ============================================================================
// Main
// ============================================================================

interface Stats {
  inserted: number;
  referencesMerged: number;
  fieldsEnriched: number;
  skipped: number;
  errors: number;
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const resume = args.includes('--resume');

  console.log(`📥 Fetching CSV from ${CSV_URL}...`);
  const response = await fetch(CSV_URL);
  if (!response.ok) {
    console.error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const text = await response.text();
  const { headers, rows } = parseCSV(text);

  if (headers.length === 0) {
    console.error('CSV appears empty or malformed.');
    process.exit(1);
  }

  console.log(`📋 Columns: ${headers.join(', ')}`);
  console.log(`📊 Total rows: ${rows.length}`);

  const headerMap = mapHeaders(headers);
  const startIndex = resume ? getStartIndex() : 0;

  if (resume && startIndex > 0) {
    console.log(`⏩ Resuming from row ${startIndex}`);
  }

  const stats: Stats = { inserted: 0, referencesMerged: 0, fieldsEnriched: 0, skipped: 0, errors: 0 };
  const limit = dryRun ? Math.min(startIndex + DRY_RUN_LIMIT, rows.length) : rows.length;

  if (dryRun) {
    console.log(`\n🔍 DRY RUN — processing first ${DRY_RUN_LIMIT} rows only, no DB writes.\n`);
  }

  for (let i = startIndex; i < limit; i++) {
    const csv = rowToCSVRow(rows[i], headerMap);
    const entry = csvRowToEntry(csv);

    if (!entry) {
      console.log(`[${i + 1}/${rows.length}] Skipping (no name): row ${i}`);
      stats.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[${i + 1}] ${entry.name} | city: ${entry.city} | date: ${entry.date} | refs: ${entry.references?.length ?? 0}`);
      if (entry.name_fa) console.log(`       name_fa: ${entry.name_fa}`);
      if (entry.bio) console.log(`       bio: ${entry.bio.slice(0, 80)}...`);
      continue;
    }

    try {
      const result = await submitMemorial(entry);

      if (result.success && !result.merged) {
        console.log(`[${i + 1}] ✅ Inserted: ${entry.name}`);
        stats.inserted++;
      } else if (result.success && result.merged) {
        console.log(`[${i + 1}] 🔗 Merged refs: ${entry.name}`);
        stats.referencesMerged++;

        // Enrich any empty fields on the existing record
        const enrichResult = await enrichMemorial(entry.name!, entry.name_fa, entry);
        if (enrichResult.updated) {
          console.log(`       ✨ Enriched fields for: ${entry.name}`);
          stats.fieldsEnriched++;
        }
      } else if (result.error?.includes('already exist')) {
        console.log(`[${i + 1}] ⏭️  Already exists: ${entry.name}`);
        stats.skipped++;

        // Still try to enrich missing fields
        const enrichResult = await enrichMemorial(entry.name!, entry.name_fa, entry);
        if (enrichResult.updated) {
          console.log(`       ✨ Enriched fields for: ${entry.name}`);
          stats.fieldsEnriched++;
        }
      } else {
        console.error(`[${i + 1}] ❌ Error for ${entry.name}: ${result.error}`);
        stats.errors++;
      }
    } catch (e) {
      const err = e as { message?: string };
      console.error(`[${i + 1}] ❌ Exception for ${entry.name}: ${err.message || e}`);
      stats.errors++;
    }

    updateIndex(i + 1);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\n=============================');
  console.log('  iranvictims.com CSV Import');
  console.log('=============================');
  if (dryRun) {
    console.log(`Dry run complete — no changes made.`);
  } else {
    console.log(`Inserted:          ${stats.inserted}`);
    console.log(`References merged: ${stats.referencesMerged}`);
    console.log(`Fields enriched:   ${stats.fieldsEnriched}`);
    console.log(`Skipped:           ${stats.skipped}`);
    console.log(`Errors:            ${stats.errors}`);
    console.log(`Total processed:   ${limit - startIndex}`);
  }
}

run().catch(console.error);
