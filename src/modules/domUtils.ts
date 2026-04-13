/**
 * Sanitizes URLs to prevent javascript:, vbscript:, and data: execution.
 *
 * @param url The URL string to sanitize.
 * @returns The sanitized URL or 'about:blank' if unsafe.
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = String(url).trim();

  try {
    const parsed = new URL(trimmed, 'https://example.invalid');
    const protocol = parsed.protocol.toLowerCase();

    if (protocol === 'http:' || protocol === 'https:') {
      return trimmed;
    }

    return 'about:blank';
  } catch {
    return 'about:blank';
  }
}

/**
 * Escapes special characters in a string to prevent XSS attacks.
 *
 * @param str The string to escape.
 * @returns The escaped string.
 */
export function escapeHTML(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
