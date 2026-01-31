
async function debug() {
  const url = 'https://t.me/RememberTheirNames/1690';
  // I need to copy the logic from extractTelegramImage to debug it, 
  // or I can just fetch the Jina URL directly here.
  
  let targetUrl = url.replace('/s/', '/');
  if (!targetUrl.includes('embed=1')) {
    targetUrl = targetUrl.includes('?') ? `${targetUrl}&embed=1` : `${targetUrl}?embed=1`;
  }

  const readerUrl = `https://r.jina.ai/${targetUrl}`;
  console.log(`Fetching: ${readerUrl}`);
  
  const response = await fetch(readerUrl, {
    headers: {
      'X-No-Cache': 'true',
      'X-With-Images-Summary': 'true',
      'Accept': 'text/plain'
    }
  });
  
  const content = await response.text();
  console.log('--- Content Start ---');
  console.log(content);
  console.log('--- Content End ---');
  
  const imgRegex = /!\[.*?\]\((https:\/\/[^)]*?)\)/g;
  const matches = [...content.matchAll(imgRegex)];
  console.log('Found images:');
  matches.forEach(m => console.log(m[1]));
}

debug();
