/* eslint-disable no-console */
import { fetchMemorials } from '../src/modules/dataService';

/**
 * Quick check of verification status
 */
async function checkStatus(): Promise<void> {
  console.log('Checking verification status...\n');

  const allMemorials = await fetchMemorials(true);
  const unverified = allMemorials.filter(m => !m.verified);
  const verified = allMemorials.filter(m => m.verified);

  console.log(`📊 Total: ${allMemorials.length}`);
  console.log(`✅ Verified: ${verified.length}`);
  console.log(`📝 Unverified: ${unverified.length}\n`);

  // Check RememberTheirNames sources
  const rtnAll = allMemorials.filter(m => {
    const hasRTNTelegram = m.media?.telegramPost?.includes('RememberTheirNames/');
    const hasRTNReference = m.references?.some(r => r.url.includes('RememberTheirNames/'));
    return hasRTNTelegram || hasRTNReference;
  });

  const rtnUnverified = rtnAll.filter(m => !m.verified);
  const rtnVerified = rtnAll.filter(m => m.verified);

  console.log(`📌 RememberTheirNames sources:`);
  console.log(`   Total: ${rtnAll.length}`);
  console.log(`   ✅ Verified: ${rtnVerified.length}`);
  console.log(`   📝 Unverified: ${rtnUnverified.length}\n`);

  if (rtnUnverified.length > 0) {
    console.log(`Unverified RTN entries (first 10):`);
    rtnUnverified.slice(0, 10).forEach(m => {
      console.log(`  - ${m.name} (${m.id})`);
    });
  }
}

checkStatus().catch(console.error);
