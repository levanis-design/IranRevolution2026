import { describe, it, expect } from 'vitest'
import { escapeHTML, sanitizeUrl } from '../domUtils'

describe('sanitizeUrl', () => {
  it('returns about:blank for dangerous protocols', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('about:blank')
    expect(sanitizeUrl(' javascript:alert(1)')).toBe('about:blank')
    expect(sanitizeUrl('\njavascript:alert(1)')).toBe('about:blank')
    expect(sanitizeUrl('\rjavascript:alert(1)')).toBe('about:blank')
    expect(sanitizeUrl('\tjavascript:alert(1)')).toBe('about:blank')
    expect(sanitizeUrl('vbscript:alert(1)')).toBe('about:blank')
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('about:blank')
  })

  it('allows http and https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com')
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com')
  })

  it('allows relative and absolute paths', () => {
    expect(sanitizeUrl('/relative/path')).toBe('/relative/path')
    expect(sanitizeUrl('relative/path')).toBe('relative/path')
    expect(sanitizeUrl('#anchor')).toBe('#anchor')
  })

  it('handles empty strings and null/undefined', () => {
    expect(sanitizeUrl('')).toBe('')
    expect(sanitizeUrl(null)).toBe('')
    expect(sanitizeUrl(undefined)).toBe('')
  })
})

describe('escapeHTML', () => {
  it('escapes special characters', () => {
    expect(escapeHTML('<b>"Hello" & \'World\'</b>'))
      .toBe('&lt;b&gt;&quot;Hello&quot; &amp; &#039;World&#039;&lt;/b&gt;')
  })

  it('handles empty strings and null/undefined', () => {
    expect(escapeHTML('')).toBe('')
    expect(escapeHTML(null)).toBe('')
    expect(escapeHTML(undefined)).toBe('')
  })

  it('does not escape normal characters', () => {
    expect(escapeHTML('Hello World 123')).toBe('Hello World 123')
  })
})
