import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mapRowToEntry, deleteMemorial, deleteReport, findDuplicateMemorialClient } from '../dataService'
import type { MemorialEntry } from '../types'

const { mockSupabase, mockSupabaseAdmin } = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockSupabase: { current: { from: vi.fn() } as any },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockSupabaseAdmin: { current: null as any }
}))

vi.mock('../supabase', () => ({
  get supabase() { return mockSupabase.current },
  get supabaseAdmin() { return mockSupabaseAdmin.current }
}))

describe('deleteMemorial', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase.current = { from: vi.fn() }
    mockSupabaseAdmin.current = null
  })

  it('successfully deletes a memorial', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq })
    mockSupabase.current.from.mockReturnValue({ delete: mockDelete })

    const result = await deleteMemorial('test-id')

    expect(mockSupabase.current.from).toHaveBeenCalledWith('memorials')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith('id', 'test-id')
    expect(result).toEqual({ success: true })
  })

  it('returns false and error if database deletion fails', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: { message: 'Database error' } })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq })
    mockSupabase.current.from.mockReturnValue({ delete: mockDelete })

    const result = await deleteMemorial('test-id')

    expect(result).toEqual({ success: false, error: 'Database error' })
  })

  it('returns false and error if Supabase client is not configured', async () => {
    mockSupabase.current = null
    const result = await deleteMemorial('test-id')

    expect(result).toEqual({ success: false, error: 'Supabase not configured' })
  })

  it('returns false and error if an exception is thrown', async () => {
    mockSupabase.current.from.mockImplementation(() => {
      throw new Error('Unexpected exception')
    })

    const result = await deleteMemorial('test-id')

    expect(result).toEqual({ success: false, error: 'Unexpected exception' })
  })

  it('uses admin client if available', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq })

    // Set up admin client
    mockSupabaseAdmin.current = {
      from: vi.fn().mockReturnValue({ delete: mockDelete })
    }

    // Even if standard client is also set, admin should be preferred
    mockSupabase.current = {
      from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: vi.fn() }) })
    }

    const result = await deleteMemorial('test-id')

    expect(mockSupabaseAdmin.current.from).toHaveBeenCalledWith('memorials')
    expect(mockSupabase.current.from).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true })
  })
})

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

describe('deleteReport', () => {
  const mockId = 'test-report-id'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEq: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDelete: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockEq = vi.fn()
    mockDelete = vi.fn().mockReturnValue({ eq: mockEq })
    mockSupabase.current = { from: vi.fn().mockReturnValue({ delete: mockDelete }) }
    mockSupabaseAdmin.current = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return success when delete is successful', async () => {
    mockEq.mockResolvedValue({ error: null })

    const result = await deleteReport(mockId)

    expect(mockSupabase.current.from).toHaveBeenCalledWith('reports')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith('id', mockId)
    expect(result).toEqual({ success: true })
  })

  it('should return error when supabase delete fails', async () => {
    const errorMessage = 'Database deletion failed'
    mockEq.mockResolvedValue({ error: { message: errorMessage } })

    const result = await deleteReport(mockId)

    expect(result).toEqual({ success: false, error: errorMessage })
  })

  it('should catch exceptions and return unknown error', async () => {
    mockEq.mockRejectedValue(new Error('Network error'))

    const result = await deleteReport(mockId)

    expect(result).toEqual({ success: false, error: 'Network error' })
  })
})

describe('findDuplicateMemorialClient', () => {
  const memorials: MemorialEntry[] = [
    {
      id: '1',
      name: 'John Doe',
      name_fa: 'جان دو',
      city: 'Tehran',
      city_fa: 'تهران',
      location: '',
      date: '2023-01-01',
      coords: { lat: 35.6, lon: 51.4 },
      bio: '',
      references: [],
      verified: true
    },
    {
      id: '2',
      name: 'Ali Reza',
      name_fa: 'علی رضا',
      city: 'Shiraz',
      city_fa: 'شیراز',
      location: 'Valiasr St',
      date: '2023-01-01',
      coords: { lat: 29.5, lon: 52.5 },
      bio: '',
      references: [],
      verified: true
    },
    {
      id: '3',
      name: 'Seyyed Hassan',
      name_fa: 'سید حسن',
      city: 'Isfahan',
      city_fa: 'اصفهان',
      location: '',
      date: '2023-01-01',
      coords: { lat: 32.6, lon: 51.6 },
      bio: '',
      references: [],
      verified: true
    }
  ]

  it('returns undefined if both English and Persian names are too short', () => {
    expect(findDuplicateMemorialClient(memorials, 'Jo', '', 'جا')).toBeUndefined()
  })

  it('finds an exact English name match when the city matches', () => {
    const result = findDuplicateMemorialClient(memorials, 'John Doe', 'Tehran')
    expect(result?.id).toBe('1')
  })

  it('finds an exact English name match when the query city is omitted', () => {
    const result = findDuplicateMemorialClient(memorials, 'John Doe')
    expect(result?.id).toBe('1')
  })

  it('does not match an exact English name when the city conflicts', () => {
    const result = findDuplicateMemorialClient(memorials, 'John Doe', 'Shiraz')
    expect(result).toBeUndefined()
  })

  it('finds an exact Persian name match', () => {
    const result = findDuplicateMemorialClient(memorials, '', undefined, 'علی رضا')
    expect(result?.id).toBe('2')
  })

  it('matches Persian partial name parts', () => {
    const expandedMemorials = [...memorials, { ...memorials[1], name_fa: 'علی رضا محمدی' }]
    const result = findDuplicateMemorialClient(expandedMemorials, '', undefined, 'علی رضا')
    expect(result?.id).toBe('2')
  })

  it('matches significant English name parts with a matching city or location', () => {
    const expandedMemorials = [...memorials, { ...memorials[1], name: 'Ali Reza Mohammadi' }]
    const result = findDuplicateMemorialClient(expandedMemorials, 'Ali Reza', 'Shiraz')
    expect(result?.id).toBe('2')
  })

  it('ignores common prefixes when evaluating partial English matches', () => {
    expect(findDuplicateMemorialClient(memorials, 'Seyyed Hass', 'Isfahan')?.id).toBe('3')
    expect(findDuplicateMemorialClient(memorials, 'Seyyed Has', 'Isfahan')).toBeUndefined()
  })

  it('matches long English names by substring inclusion', () => {
    const expandedMemorials = [...memorials, { ...memorials[0], id: '4', name: 'John Doe Smith' }]
    const result = findDuplicateMemorialClient(expandedMemorials, 'John Doe Sm')
    expect(result?.id).toBe('4')
  })

  it('matches long Persian names by substring inclusion', () => {
    const expandedMemorials = [...memorials, { ...memorials[0], id: '5', name_fa: 'محمد علی احمدی' }]
    const result = findDuplicateMemorialClient(expandedMemorials, '', undefined, 'محمد علی')
    expect(result?.id).toBe('5')
  })

  it('respects excludeId when finding duplicates', () => {
    const result = findDuplicateMemorialClient(memorials, 'John Doe', 'Tehran', undefined, '1')
    expect(result).toBeUndefined()
  })
})
