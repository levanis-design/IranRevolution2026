import { describe, it, expect } from 'vitest'
import { mapRowToEntry } from '../dataService'

describe('mapRowToEntry', () => {
  const mockRow = {
    id: 'test-id',
    created_at: '2023-01-01T00:00:00Z',
    name: 'John Doe',
    name_fa: 'جان دو',
    city: 'Tehran',
    city_fa: 'تهران',
    location: 'Azadi Square',
    location_fa: 'میدان آزادی',
    date: '2023-01-01',
    coords: { lat: 35.6892, lon: 51.3890 },
    bio: 'A test bio',
    bio_fa: 'یک بیوگرافی آزمایشی',
    testimonials: ['Testimonial 1'],
    media: { photo: 'photo.jpg' },
    source_links: [{ label: 'Source', url: 'https://example.com' }],
    verified: true,
    submitted_by: 'user-id'
  }

  it('correctly maps a complete MemorialRow to MemorialEntry', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = mapRowToEntry(mockRow as any)

    expect(entry.id).toBe(mockRow.id)
    expect(entry.name).toBe(mockRow.name)
    expect(entry.name_fa).toBe(mockRow.name_fa)
    expect(entry.city).toBe(mockRow.city)
    expect(entry.city_fa).toBe(mockRow.city_fa)
    expect(entry.location).toBe(mockRow.location)
    expect(entry.location_fa).toBe(mockRow.location_fa)
    expect(entry.date).toBe(mockRow.date)
    expect(entry.coords).toEqual(mockRow.coords)
    expect(entry.bio).toBe(mockRow.bio)
    expect(entry.bio_fa).toBe(mockRow.bio_fa)
    expect(entry.testimonials).toEqual(mockRow.testimonials)
    expect(entry.media).toEqual(mockRow.media)
    expect(entry.references).toEqual(mockRow.source_links)
    expect(entry.verified).toBe(mockRow.verified)
  })

  it('handles null values for optional fields', () => {
    const minimalRow = {
      id: 'test-id',
      created_at: '2023-01-01T00:00:00Z',
      name: 'John Doe',
      name_fa: null,
      city: 'Tehran',
      city_fa: null,
      location: null,
      location_fa: null,
      date: '2023-01-01',
      coords: { lat: 35.6892, lon: 51.3890 },
      bio: 'A test bio',
      bio_fa: null,
      testimonials: null,
      media: null,
      source_links: null,
      verified: false,
      submitted_by: null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = mapRowToEntry(minimalRow as any)

    expect(entry.name_fa).toBeUndefined()
    expect(entry.city_fa).toBeUndefined()
    expect(entry.location).toBe('')
    expect(entry.location_fa).toBeUndefined()
    expect(entry.bio_fa).toBeUndefined()
    expect(entry.testimonials).toBeUndefined()
    expect(entry.media).toBeNull() // row.media was null, cast to entry.media
    expect(entry.references).toEqual([])
  })

  it('handles empty string or default values for location', () => {
    const rowWithEmptyLocation = {
      id: 'test-id',
      name: 'John Doe',
      city: 'Tehran',
      location: '',
      date: '2023-01-01',
      coords: { lat: 35.6, lon: 51.4 },
      bio: '',
      verified: false,
      source_links: null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = mapRowToEntry(rowWithEmptyLocation as any)
    expect(entry.location).toBe('')
  })

  it('handles non-array testimonials', () => {
    const rowWithInvalidTestimonials = {
      id: 'test-id',
      name: 'John Doe',
      city: 'Tehran',
      date: '2023-01-01',
      coords: { lat: 35.6, lon: 51.4 },
      bio: '',
      testimonials: 'not an array',
      verified: false,
      source_links: null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = mapRowToEntry(rowWithInvalidTestimonials as any)
    expect(entry.testimonials).toBeUndefined()
  })
})
