import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl
      }))
    }
  }))
}))

describe('uploadImageToSupabase', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    originalEnv = { ...process.env }

    // Set environment variables to force createClient initialization
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key'
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('returns null if both supabase and supabaseAdmin are null', async () => {
    // Delete env vars to force clients to be null
    delete process.env.VITE_SUPABASE_URL
    delete process.env.VITE_SUPABASE_ANON_KEY
    delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

    const { uploadImageToSupabase } = await import('../supabase')
    const result = await uploadImageToSupabase(new ArrayBuffer(8), 'http://example.com/test.jpg')

    expect(result).toBeNull()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('returns null and logs error if Supabase upload returns an error', async () => {
    const { uploadImageToSupabase } = await import('../supabase')

    // Mock the upload method to return an error
    mockUpload.mockResolvedValueOnce({ error: { message: 'Upload failed' } })

    // Silence console.error for test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await uploadImageToSupabase(new ArrayBuffer(8), 'http://example.com/test.jpg')

    expect(result).toBeNull()
    expect(mockUpload).toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith('Supabase upload error:', 'Upload failed')

    consoleSpy.mockRestore()
  })

  it('returns null and logs exception if an exception is thrown during upload', async () => {
    const { uploadImageToSupabase } = await import('../supabase')

    const mockError = new Error('Network failure')
    mockUpload.mockRejectedValueOnce(mockError)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await uploadImageToSupabase(new ArrayBuffer(8), 'http://example.com/test.jpg')

    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith('Upload exception:', mockError)

    consoleSpy.mockRestore()
  })

  it('returns public URL on successful upload', async () => {
    const { uploadImageToSupabase } = await import('../supabase')

    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({ data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/memorial-images/mock-uuid.jpg' } })

    // Mock crypto.randomUUID for deterministic filename assertions
    const mockUUID = '123e4567-e89b-12d3-a456-426614174000'
    vi.stubGlobal('crypto', {
      randomUUID: () => mockUUID
    })

    const result = await uploadImageToSupabase(new ArrayBuffer(8), 'http://example.com/test.jpg')

    expect(result).toBe('https://example.supabase.co/storage/v1/object/public/memorial-images/mock-uuid.jpg')
    expect(mockUpload).toHaveBeenCalledWith(
      `${mockUUID}.jpg`,
      expect.any(ArrayBuffer),
      {
        contentType: 'image/jpeg',
        upsert: false
      }
    )
    expect(mockGetPublicUrl).toHaveBeenCalledWith(`${mockUUID}.jpg`)
  })

  it('correctly maps file extensions to content types', async () => {
    const { uploadImageToSupabase } = await import('../supabase')

    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({ data: { publicUrl: 'mock-url' } })

    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' })

    await uploadImageToSupabase(new ArrayBuffer(8), 'http://example.com/image.png')

    expect(mockUpload).toHaveBeenCalledWith(
      'test-uuid.png',
      expect.any(ArrayBuffer),
      {
        contentType: 'image/png',
        upsert: false
      }
    )
  })

  it('uses the format query parameter when the path has no file extension', async () => {
    const { uploadImageToSupabase } = await import('../supabase')

    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({ data: { publicUrl: 'mock-url' } })

    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' })

    await uploadImageToSupabase(
      new ArrayBuffer(8),
      'https://pbs.twimg.com/media/G_zbS38bUAQ7Crj?format=jpg&name=small'
    )

    expect(mockUpload).toHaveBeenCalledWith(
      'test-uuid.jpg',
      expect.any(ArrayBuffer),
      {
        contentType: 'image/jpeg',
        upsert: false
      }
    )
  })

  it('defaults to jpg for extensionless URLs without a format query parameter', async () => {
    const { uploadImageToSupabase } = await import('../supabase')

    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({ data: { publicUrl: 'mock-url' } })

    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' })

    await uploadImageToSupabase(
      new ArrayBuffer(8),
      'https://example.com/image'
    )

    expect(mockUpload).toHaveBeenCalledWith(
      'test-uuid.jpg',
      expect.any(ArrayBuffer),
      {
        contentType: 'image/jpeg',
        upsert: false
      }
    )
  })
})
