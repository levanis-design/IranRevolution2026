/* eslint-disable no-console */
import { fetchMemorials, verifyMemorial } from '../src/modules/dataService';

/**
 * Quick batch verification for RememberTheirNames submissions
 * Automatically approves all submissions from RememberTheirNames channel
 * These are high-credibility sources that don't need manual review
 */

async function batchVerifyRTN(): Promise<void> {
  console.log('🚀 Batch Verifying RememberTheirNames Submissions...\n');

  // Fetch all memorials including unverified
  const allMemorials = await fetchMemorials(true);
  const unverified = allMemorials.filter(m => !m.verified);

  // Filter for RememberTheirNames sources
  const rtnSubmissions = unverified.filter(m => {
    const hasRTNTelegram = m.media?.telegramPost?.includes('RememberTheirNames/');
    const hasRTNReference = m.references?.some(r => r.url.includes('RememberTheirNames/'));
    return hasRTNTelegram || hasRTNReference;
  });

  console.log(`📊 Found ${allMemorials.length} total memorials`);
  console.log(`📝 ${unverified.length} unverified submissions`);
  console.log(`✅ ${rtnSubmissions.length} from RememberTheirNames (auto-approve)\n`);

  if (rtnSubmissions.length === 0) {
    console.log('No RememberTheirNames submissions to verify.');
    return;
  }

  let approved = 0;
  let merged = 0;
  let errors = 0;

  const CHUNK_SIZE = 5;

  for (let i = 0; i < rtnSubmissions.length; i += CHUNK_SIZE) {
    const chunk = rtnSubmissions.slice(i, i + CHUNK_SIZE);

    await Promise.all(
      chunk.map(async memorial => {
        try {
          if (!memorial.id) {
            console.error(`  ❌ Skipping entry without ID: ${memorial.name}`);
            errors++;
            return;
          }

          const result = await verifyMemorial(memorial.id);

          if (result.success) {
            if (result.merged) {
              console.log(`  ✅ Merged with existing entry: ${memorial.name} (${memorial.id})`);
              merged++;
            } else {
              console.log(`  ✅ Verified: ${memorial.name} (${memorial.id})`);
              approved++;
            }
          } else {
            console.log(`  ❌ Failed to verify ${memorial.name} (${memorial.id}): ${result.error}`);
            errors++;
          }
        } catch (error) {
          console.error(`  ❌ Error verifying ${memorial.name} (${memorial.id}): ${error}`);
          errors++;
        }
      })
    );

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n═══════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Total RTN submissions:  ${rtnSubmissions.length}`);
  console.log(`✅ Verified:            ${approved}`);
  console.log(`🔄 Merged:              ${merged}`);
  console.log(`❌ Errors:              ${errors}`);
  console.log('═══════════════════════════════════════');
}

// Run if called directly
batchVerifyRTN().catch(console.error);
