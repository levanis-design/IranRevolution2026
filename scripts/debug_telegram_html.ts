
async function debugHtml() {
  const url = 'https://t.me/RememberTheirNames/1690?embed=1';
  console.log(`Fetching HTML from: ${url}`);
  
  const response = await fetch(url);
  const html = await response.text();
  
  // Look for background-image
  // usually: style="background-image:url('...')"
  const matches = html.match(/background-image:url\('([^']+)'\)/g);
  console.log('Background images found:');
  if (matches) {
      matches.forEach(m => console.log(m));
  } else {
      console.log('No background images found.');
  }

  // Also check for img tags
  const imgMatches = html.match(/<img[^>]+src="([^"]+)"/g);
  console.log('Img tags found:');
  if (imgMatches) {
      imgMatches.forEach(m => console.log(m));
  }
}

debugHtml();
