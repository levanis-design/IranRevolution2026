import { spawn } from 'child_process';

interface AggregationResult {
  scraper: string;
  success: boolean;
  exitCode: number | null;
  duration: number;
  output?: string;
}

const SCRAPERS = [
  {
    name: 'Telegram',
    command: 'npx',
    args: ['tsx', '--env-file=.env', 'scripts/scrape_telegram_range.ts', 'RememberTheirNames', '1', '5000', '--resume'],
    enabled: true
  },
  {
    name: 'Web (Jina Reader)',
    command: 'npx',
    args: ['tsx', '--env-file=.env', 'scripts/scrapers/web_scraper.ts', '--resume'],
    enabled: true
  },
  {
    name: 'Wikipedia',
    command: 'npx',
    args: ['tsx', '--env-file=.env', 'scripts/scrapers/wikipedia_scraper.ts'],
    enabled: true
  },
  {
    name: 'Twitter/X',
    command: 'npx',
    args: ['tsx', '--env-file=.env', 'scripts/scrapers/twitter_scraper.ts', '--resume'],
    enabled: true
  }
];

function runCommand(command: string, args: string[]): Promise<AggregationResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = '';

    const child = spawn(command, args, {
      stdio: 'pipe',
      shell: true
    });

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(`[${command}] ${text}`);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(`[${command} ERROR] ${text}`);
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        scraper: command,
        success: code === 0,
        exitCode: code,
        duration,
        output: output.substring(0, 500)
      });
    });
  });
}

async function aggregateAllSources(scraper?: string): Promise<void> {
  console.log('🔄 Starting Data Aggregation from Multiple Sources...\n');
  console.log('=' .repeat(60));
  console.log('Scrapers to run:');
  SCRAPERS.forEach((s, i) => {
    if (!scraper || s.name.toLowerCase().includes(scraper.toLowerCase())) {
      console.log(`  ${i + 1}. ${s.name} ${s.enabled ? '✓' : '✗'}`);
    }
  });
  console.log('=' .repeat(60));
  console.log('');

  const results: AggregationResult[] = [];
  const startTime = Date.now();

  for (const scraperConfig of SCRAPERS) {
    if (!scraperConfig.enabled) {
      console.log(`⏭️  Skipping disabled scraper: ${scraperConfig.name}\n`);
      continue;
    }

    if (scraper && !scraperConfig.name.toLowerCase().includes(scraper.toLowerCase())) {
      console.log(`⏭️  Skipping (not selected): ${scraperConfig.name}\n`);
      continue;
    }

    console.log(`🚀 Running ${scraperConfig.name} scraper...`);
    console.log(`   Command: ${scraperConfig.command} ${scraperConfig.args.join(' ')}`);
    console.log('');

    const result = await runCommand(scraperConfig.command, scraperConfig.args);
    results.push(result);

    console.log('');
    console.log(`✓ ${scraperConfig.name} completed in ${(result.duration / 1000).toFixed(2)}s`);
    console.log(`  Exit code: ${result.exitCode}`);
    console.log(`  Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log('');

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const totalDuration = Date.now() - startTime;
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('');
  console.log('=' .repeat(60));
  console.log('📊 Aggregation Summary');
  console.log('=' .repeat(60));
  console.log(`Total time: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Successful scrapers: ${successful}/${results.length}`);
  console.log(`Failed scrapers: ${failed}/${results.length}`);
  console.log('');
  console.log('Details:');
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.scraper}: ${r.success ? '✓' : '✗'} (${(r.duration / 1000).toFixed(2)}s)`);
  });
  console.log('=' .repeat(60));

  if (failed > 0) {
    console.log('\n⚠️  Some scrapers failed. Check the output above for details.');
  } else {
    console.log('\n✅ All scrapers completed successfully!');
  }
}

function parseArgs(): string | null {
  const args = process.argv.slice(2);
  const scraperArg = args.find(a => !a.startsWith('--'));
  return scraperArg || null;
}

async function main(): Promise<void> {
  const scraper = parseArgs();
  await aggregateAllSources(scraper || undefined);
}

main().catch(console.error);
