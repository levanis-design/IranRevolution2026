/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { initInstagram } from '../instagram'

describe('initInstagram', () => {
  beforeEach(() => {
    // Clear DOM before each test
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('injects the instagram embed script into the document', () => {
    initInstagram()

    const script = document.getElementById('instagram-embed-js') as HTMLScriptElement

    expect(script).not.toBeNull()
    expect(script.tagName).toBe('SCRIPT')
    expect(script.src).toBe('https://www.instagram.com/embed.js')
    expect(script.async).toBe(true)
    expect(document.body.contains(script)).toBe(true)
  })

  it('does not inject the script if it already exists', () => {
    // Pre-inject a mock script
    const existingScript = document.createElement('script')
    existingScript.id = 'instagram-embed-js'
    existingScript.dataset.custom = 'true'
    document.body.appendChild(existingScript)

    initInstagram()

    const scripts = document.querySelectorAll('#instagram-embed-js')
    expect(scripts.length).toBe(1)
    expect((scripts[0] as HTMLScriptElement).dataset.custom).toBe('true')
  })

  it('does nothing when window is undefined', () => {
    // Save the original window descriptor
    const originalWindow = globalThis.window;

    // Create a spy for document.createElement to ensure it is not called
    const createElementSpy = vi.spyOn(document, 'createElement')

    try {
      // Temporarily mock window as undefined
      // We must use Object.defineProperty because window is non-configurable in some jsdom setups,
      // but in vitest/jsdom we can often delete it or use a spy.
      // An easier way in Node environments is to just override the global.
      // However, typical jsdom environment makes this tricky.
      // Let's use vi.stubGlobal
      vi.stubGlobal('window', undefined)

      initInstagram()

      expect(createElementSpy).not.toHaveBeenCalled()
      expect(document.getElementById('instagram-embed-js')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
