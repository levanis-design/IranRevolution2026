const OPENROUTER_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_OPENROUTER_API_KEY : process.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_MODEL = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free') : (process.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free');

import { uploadImageToSupabase } from './supabase';

/**
 * Fetches an image from Telegram using the Bot API if possible, or falls back to scraping.
 * Then uploads the image to Supabase.
 */
async function fetchAndUploadTelegramImage(url: string): Promise<string | null> {
  if (!url || !url.includes('t.me/')) return null;

  try {
    // Step 1: Get a direct image URL (telesco.pe) by scraping the post page
    // We do this because Bot API cannot easily get historical messages without admin rights
    const response = await fetch(url);
    if (!response.ok) return null;
    const html = await response.text();
    
    // Only proceed if the post actually contains a photo/video widget.
    // Text-only posts set og:image to the channel avatar — we must not use that.
    const hasPostMedia = html.includes('tgme_widget_message_photo') ||
                         html.includes('tgme_widget_message_video') ||
                         html.includes('message_media_photo')
    if (!hasPostMedia) return null;

    // Find og:image (usually a telesco.pe link)
    const ogImageMatch = html.match(/<meta property="og:image" content="(https:\/\/cdn\d+\.telesco\.pe\/file\/[^"]+)"/);
    let imageUrl = ogImageMatch ? ogImageMatch[1] : null;

    if (!imageUrl) {
      const telescoMatch = html.match(/https:\/\/cdn\d+\.telesco\.pe\/file\/[^"'\s)]+/);
      imageUrl = telescoMatch ? telescoMatch[0] : null;
    }

    if (!imageUrl) return null;

    // Step 2: Download the image
    const imgResponse = await fetch(imageUrl, {
      headers: { 'Referer': 'https://t.me/' }
    });
    if (!imgResponse.ok) return null;
    const buffer = await imgResponse.arrayBuffer();

    // Step 3: Upload to Supabase
    return await uploadImageToSupabase(buffer, imageUrl);
  } catch (error) {
    console.error('Error in fetchAndUploadTelegramImage:', error);
    return null;
  }
}

/**
 * Extracts the primary image URL from an Instagram post using Jina Reader and OpenRouter.
 */
export async function extractInstagramImage(url: string): Promise<string | null> {
  if (!url || !url.includes('instagram.com')) {
    return null;
  }

  try {
    // Optimization: Use /embed/captioned/ for Instagram to bypass login walls
    const cleanUrl = url.split('?')[0].replace(/\/$/, '');
    const targetUrl = `${cleanUrl}/embed/captioned/`;
    const readerUrl = `https://r.jina.ai/${targetUrl}`;
    
    const response = await fetch(readerUrl, {
      headers: {
        'X-No-Cache': 'true',
        'X-With-Images-Summary': 'true',
        'Accept': 'text/plain'
      }
    });

    if (!response.ok) return null;
    const content = await response.text();
    
    if (!content || content.length < 100 || content.includes('Login • Instagram')) {
      // Fallback: simple regex to find the first image that isn't a profile pic if possible
      const imgRegex = /!\[.*?\]\((https:\/\/[^)]*?)\)/g;
      const matches = [...content.matchAll(imgRegex)];
      for (const match of matches) {
        const imgUrl = match[1];
        if (!imgUrl.includes('profile_pic') && !imgUrl.includes('icon') && !imgUrl.includes('logo')) {
          return imgUrl;
        }
      }
      return null;
    }

    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk-or-v1-...') {
      return null;
    }

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': (typeof window !== 'undefined') ? window.location.origin : 'https://iranrevolution2026.github.io',
        'X-Title': 'Iran Revolution Memorial'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert at identifying the main media content from an Instagram post.
            Given the markdown content of an Instagram post, find the URL of the primary image or video thumbnail.
            Ignore profile pictures, icons, or UI elements.
            
            Return ONLY the direct URL of the image. If no image is found, return "NONE".`
          },
          {
            role: 'user',
            content: `Find the main image URL in this content: ${content.substring(0, 5000)}`
          }
        ],
        temperature: 0.1
      })
    });

    if (!aiResponse.ok) return null;

    const data = await aiResponse.json();
    const result = data.choices[0].message.content.trim();

    return (result === 'NONE' || !result.startsWith('http')) ? null : result;
  } catch (error) {
    return null;
  }
}

/**
 * To allow mocking in tests
 */
export const extractors = {
  extractXPostImage,
  extractInstagramImage,
  extractTelegramImage
};

/**
 * Extracts the primary image URL from a social media post (X, Instagram, or Telegram).
 */
export async function extractSocialImage(url: string): Promise<string | null> {
  if (!url) return null;

  if (url.includes('x.com') || url.includes('twitter.com')) {
    return extractors.extractXPostImage(url);
  } else if (url.includes('instagram.com')) {
    return extractors.extractInstagramImage(url);
  } else if (url.includes('t.me/')) {
    return extractors.extractTelegramImage(url);
  }
  return null;
}

/**
 * Extracts the primary image URL from a Telegram post using Jina Reader.
 */
export async function extractTelegramImage(url: string): Promise<string | null> {
  if (!url || !url.includes('t.me/')) {
    return null;
  }

  // Attempt to fetch, download and upload to Supabase immediately
  // This avoids broken telesco.pe links in the database
  const supabaseUrl = await fetchAndUploadTelegramImage(url);
  if (supabaseUrl) return supabaseUrl;

  try {
    // Use embed mode for cleaner content and better separation of profile vs post content
    // Convert https://t.me/s/channel/123 -> https://t.me/channel/123?embed=1
    let targetUrl = url.replace('/s/', '/');
    if (!targetUrl.includes('embed=1')) {
      targetUrl = targetUrl.includes('?') ? `${targetUrl}&embed=1` : `${targetUrl}?embed=1`;
    }

    const readerUrl = `https://r.jina.ai/${targetUrl}`;
    
    const response = await fetch(readerUrl, {
      headers: {
        'X-No-Cache': 'true',
        'X-With-Images-Summary': 'true',
        'Accept': 'text/plain'
      }
    });

    if (!response.ok) {
      console.error(`Jina Reader API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const content = await response.text();
    
    // Find all images
    // Regex for markdown images: ![alt](url)
    const imgRegex = /!\[.*?\]\((https:\/\/[^)]*?)\)/g;
    const matches = [...content.matchAll(imgRegex)];
    
    if (matches.length === 0) {
      return null;
    }

    // Frequency analysis to filter out profile pictures (which usually appear multiple times in header/footer)
    const urlCounts = new Map<string, number>();

    for (const match of matches) {
      // Clean URL (remove backslashes often added by Jina/Markdown escaping)
      const rawUrl = match[1].replace(/\\_/g, '_');
      // Normalize URL (sometimes parameters differ?) - usually exact match is enough
      
      urlCounts.set(rawUrl, (urlCounts.get(rawUrl) || 0) + 1);
    }

    // Filter logic:
    // 1. Prefer images that appear exactly ONCE (content images).
    // 2. Profile pics usually appear 2+ times (header + footer).
    // 3. Skip images that look like UI icons (logo, icon, avatar - though avatar might be in name).

    const contentImages = Array.from(urlCounts.keys()).filter(u => {
      const count = urlCounts.get(u) || 0;
      const isIcon = u.includes('logo') || u.includes('icon') || u.includes('assets');
      return count === 1 && !isIcon;
    });

    if (contentImages.length > 0) {
      // Return the first unique content image
      return contentImages[0];
    }

    // If no unique images found, and we only have repeated images, assume they are profile pics and return null
    // strict mode: do not return profile pic
    return null;

  } catch (error) {
    console.error('Error extracting Telegram image:', error);
    return null;
  }
}

/**
 * Extracts the primary image URL from an X (Twitter) post using Jina Reader and OpenRouter.
 */
export async function extractXPostImage(url: string): Promise<string | null> {
  if (!url || (!url.includes('x.com') && !url.includes('twitter.com'))) {
    return null;
  }

  try {
    // Step 1: Fetch URL content as Markdown using Jina Reader API
    const readerUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(readerUrl, {
      headers: {
        'X-No-Cache': 'true',
        'X-With-Images-Summary': 'true',
        'Accept': 'text/plain'
      }
    });

    if (!response.ok) {
      return null;
    }

    const content = await response.text();
    
    if (!content || content.length < 100) {
      return null;
    }

    // Step 2: Use OpenRouter to identify the main image of the post (not the profile picture)
    // We want the image that likely represents the person or the event.
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk-or-v1-...') {
      // Fallback: simple regex to find the first image that isn't a profile pic if possible
      const imgRegex = /!\[.*?\]\((https:\/\/pbs\.twimg\.com\/media\/.*?)\)/g;
      const matches = [...content.matchAll(imgRegex)];
      if (matches.length > 0) {
        // Return the first media image
        return matches[0][1];
      }
      return null;
    }

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': (typeof window !== 'undefined') ? window.location.origin : 'https://iranrevolution2026.github.io',
        'X-Title': 'Iran Revolution Memorial'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert at identifying the main media content from a social media post.
            Given the markdown content of an X (Twitter) post, find the URL of the primary image attached to the post.
            Ignore profile pictures, icons, or UI elements. Look for images in the "media" or "pbs.twimg.com/media/" category.
            
            Return ONLY the direct URL of the image. If no image is found, return "NONE".`
          },
          {
            role: 'user',
            content: `Find the main image URL in this content: ${content.substring(0, 5000)}`
          }
        ],
        temperature: 0.1
      })
    });

    if (!aiResponse.ok) return null;

    const data = await aiResponse.json();
    const result = data.choices[0].message.content.trim();

    if (result === 'NONE' || !result.startsWith('http')) {
      // Fallback to regex if AI fails or returns nothing
      const imgRegex = /!\[.*?\]\((https:\/\/pbs\.twimg\.com\/media\/.*?)\)/;
      const match = content.match(imgRegex);
      return match ? match[1] : null;
    }

    return result;
  } catch (error) {
    return null;
  }
}
