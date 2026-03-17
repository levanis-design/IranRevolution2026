/* eslint-disable no-console */
import { fetchMemorials, verifyMemorial } from '../src/modules/dataService';

/**
 * Batch verification for iranvictims.com submissions
 * Automatically approves all submissions sourced from iranvictims.com
 * This is a curated, reputable human rights database — no manual review needed
 */

async function batchVerifyIranVictims(): Promise<void> {
  console.log('🚀 Batch Verifying iranvictims.com Submissions...\n');

  // Fetch all memorials including unverified
  const allMemorials = await fetchMemorials(true);
  const unverified = allMemorials.filter(m => !m.verified);

  // Filter for iranvictims.com sources
  const ivSubmissions = unverified.filter(m =>
    m.references?.some(r => r.url.includes('iranvictims.com'))
  );

  console.log(`📊 Found ${allMemorials.length} total memorials`);
  console.log(`📝 ${unverified.length} unverified submissions`);
  console.log(`✅ ${ivSubmissions.length} from iranvictims.com (auto-approve)\n`);

  if (ivSubmissions.length === 0) {
    console.log('No iranvictims.com submissions to verify.');
    return;
  }

  let approved = 0;
  let merged = 0;
  let errors = 0;

  for (const memorial of ivSubmissions) {
    try {
      if (!memorial.id) {
        console.error(`  ❌ Skipping entry without ID: ${memorial.name}`);
        errors++;
        continue;
      }

      console.log(`Verifying: ${memorial.name} (${memorial.city})`);

      const result = await verifyMemorial(memorial.id);

      if (result.success) {
        if (result.merged) {
          console.log(`  🔄 Merged with existing entry`);
          merged++;
        } else {
          console.log(`  ✅ Verified`);
          approved++;
        }
      } else {
        console.log(`  ❌ Failed: ${result.error}`);
        errors++;
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
      errors++;
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Total iranvictims.com:  ${ivSubmissions.length}`);
  console.log(`✅ Verified:            ${approved}`);
  console.log(`🔄 Merged duplicates:   ${merged}`);
  console.log(`❌ Errors:              ${errors}`);
  console.log('═══════════════════════════════════════');
}

batchVerifyIranVictims().catch(console.error);
