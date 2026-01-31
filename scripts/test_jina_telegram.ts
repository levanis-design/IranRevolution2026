
import { extractTelegramImage } from '../src/modules/imageExtractor';

async function test() {
  const url = 'https://t.me/RememberTheirNames/1690';
  console.log(`Testing extraction from: ${url}`);
  const imageUrl = await extractTelegramImage(url);
  console.log(`Extracted URL: ${imageUrl}`);
  
  if (imageUrl) {
      console.log('Attempting to fetch image...');
      try {
          const res = await fetch(imageUrl);
          console.log(`Fetch status: ${res.status}`);
          if (res.ok) {
              console.log('Image fetched successfully.');
          } else {
              console.log('Image fetch failed with status text:', res.statusText);
          }
      } catch (e) {
          console.error('Fetch failed:', e);
      }
  } else {
      console.log('No image extracted.');
  }
}

test();
