import { describe, it, expect } from 'vitest'
import { labelFromUrl } from '../details'

describe('labelFromUrl', () => {
  it('returns appropriate labels for known domains', () => {
    expect(labelFromUrl('https://t.me/something')).toBe('Telegram')
    expect(labelFromUrl('https://www.instagram.com/p/123')).toBe('Instagram')
    expect(labelFromUrl('https://x.com/abc')).toBe('X (Twitter)')
    expect(labelFromUrl('https://twitter.com/abc')).toBe('X (Twitter)')
    expect(labelFromUrl('https://www.youtube.com/watch?v=123')).toBe('YouTube')
    expect(labelFromUrl('https://youtu.be/123')).toBe('YouTube')
    expect(labelFromUrl('https://facebook.com/something')).toBe('Facebook')
    expect(labelFromUrl('https://fb.com/something')).toBe('Facebook')
    expect(labelFromUrl('https://hengaw.net/en')).toBe('Hengaw')
    expect(labelFromUrl('https://iranhr.net/en')).toBe('IranHR')
    expect(labelFromUrl('https://amnesty.org/en')).toBe('Amnesty International')
    expect(labelFromUrl('https://iranwire.com/en')).toBe('IranWire')
    expect(labelFromUrl('https://iranvictims.com/en')).toBe('Iran Victims')
  })

  it('capitalizes the first part of the domain for unknown domains', () => {
    expect(labelFromUrl('https://example.com/path')).toBe('Example')
    expect(labelFromUrl('https://www.bbc.com/news')).toBe('Bbc')
    expect(labelFromUrl('http://my-site.org')).toBe('My-site')
  })

  it('returns "Source" for invalid URLs that throw in new URL()', () => {
    expect(labelFromUrl('invalid-url')).toBe('Source')
    expect(labelFromUrl('')).toBe('Source')
    expect(labelFromUrl('not a url')).toBe('Source')
  })
})
