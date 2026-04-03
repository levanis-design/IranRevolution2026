export async function fetchJinaReader(url: string): Promise<Response> {
  let targetUrl = url;
  if (url.includes('instagram.com')) {
    const cleanUrl = url.split('?')[0].replace(/\/$/, '');
    targetUrl = `${cleanUrl}/embed/captioned/`;
  } else if (url.includes('t.me/')) {
    targetUrl = url.replace('/s/', '/');
    if (!targetUrl.includes('embed=1')) {
      targetUrl = targetUrl.includes('?') ? `${targetUrl}&embed=1` : `${targetUrl}?embed=1`;
    }
  }

  const readerUrl = `https://r.jina.ai/${targetUrl}`;

  return fetch(readerUrl, {
    headers: {
      'X-No-Cache': 'true',
      'X-With-Images-Summary': 'true',
      'Accept': 'text/plain'
    }
  });
}
