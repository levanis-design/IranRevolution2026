import { describe, it, expect } from 'vitest'
import { escapeHTML } from '../domUtils'

describe('escapeHTML', () => {
  it('escapes special characters', () => {
    expect(escapeHTML('<b>"Hello" & \'World\'</b>'))
      .toBe('&lt;b&gt;&quot;Hello&quot; &amp; &#039;World&#039;&lt;/b&gt;')
  })

  it('handles empty strings and null/undefined', () => {
    expect(escapeHTML('')).toBe('')
    expect(escapeHTML(null as any)).toBe('')
    expect(escapeHTML(undefined)).toBe('')
  })

  it('does not escape normal characters', () => {
    expect(escapeHTML('Hello World 123')).toBe('Hello World 123')
  })
})
