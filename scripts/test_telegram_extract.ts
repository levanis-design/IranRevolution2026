
import { extractTelegramImage } from '../src/modules/imageExtractor.ts';

async function test() {
  const url = 'https://t.me/RememberTheirNames/1693';
  console.log(`Testing extraction for: ${url}`);
  
  // Try with /s/ prefix for better scraping
  const sUrl = url.replace('t.me/', 't.me/s/');
  console.log(`\nTesting extraction for (s-version): ${sUrl}`);
  
  const resultS = await extractTelegramImage(sUrl);
  console.log('Result (s-version):', resultS);
  
  const readerUrlS = `https://r.jina.ai/${sUrl}`;
  console.log(`Fetching raw Jina output from: ${readerUrlS}`);
  const responseS = await fetch(readerUrlS, {
      headers: {
        'X-No-Cache': 'true',
        'X-With-Images-Summary': 'true',
        'Accept': 'text/plain'
      }
    });
  const textS = await responseS.text();
  
  console.log('--- Extracted Images ---');
  const imgRegex = /!\[.*?\]\((.*?)\)/g;
  const matches = [...textS.matchAll(imgRegex)];
  matches.forEach((m, i) => console.log(`Image ${i + 1}: ${m[1]}`));
  
  // Test with Selector
  console.log('\n--- Testing with Selector .tgme_widget_message_photo_wrap ---');
  const readerUrlSelector = `https://r.jina.ai/${sUrl}`;
  const responseSelector = await fetch(readerUrlSelector, {
      headers: {
        'X-No-Cache': 'true',
        'X-With-Images-Summary': 'true',
        'Accept': 'text/plain',
        'X-Target-Selector': '.tgme_widget_message_photo_wrap'
      }
    });
  const textSelector = await responseSelector.text();
  console.log(textSelector.substring(0, 2000));
  
  const matchesSelector = [...textSelector.matchAll(imgRegex)];
  matchesSelector.forEach((m, i) => console.log(`Selector Image ${i + 1}: ${m[1]}`));

  // Test Embed URL
  const embedUrl = `${url}?embed=1`;
  console.log(`\nTesting extraction for Embed URL: ${embedUrl}`);
  
  const readerUrlEmbed = `https://r.jina.ai/${embedUrl}`;
  const responseEmbed = await fetch(readerUrlEmbed, {
      headers: {
        'X-No-Cache': 'true',
        'X-With-Images-Summary': 'true',
        'Accept': 'text/plain'
      }
    });
  const textEmbed = await responseEmbed.text();
  console.log('--- Embed Content Start ---');
  console.log(textEmbed.substring(0, 2000));
  
  const matchesEmbed = [...textEmbed.matchAll(imgRegex)];
  matchesEmbed.forEach((m, i) => console.log(`Embed Image ${i + 1}: ${m[1]}`));
  
  console.log('--- Raw Content Start ---');
  console.log(textS.substring(0, 2000));
  console.log('--- Raw Content End ---');
}

test();
