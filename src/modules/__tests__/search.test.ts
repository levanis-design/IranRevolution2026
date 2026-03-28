import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupSearch } from '../search'
import type { MemorialEntry } from '../types'

describe('setupSearch', () => {
  const data: MemorialEntry[] = [
    {
      id: '1',
      name: 'Ali',
      name_fa: 'علی',
      city: 'Tehran',
      city_fa: 'تهران',
      location: 'Square',
      location_fa: 'میدان',
      date: '2022-11-01',
      bio: 'student',
      bio_fa: 'دانشجو'
    },
    {
      id: '2',
      name: 'Sara',
      name_fa: 'سارا',
      city: 'Shiraz',
      city_fa: 'شیراز',
      location: 'Street',
      location_fa: 'خیابان',
      date: '2022-10-01',
      bio: 'artist',
      bio_fa: 'هنرمند'
    },
    {
      id: '3',
      name: 'Unknown',
      city: 'Nowhere',
      location: 'Nowhere',
      date: '2023-01-01',
      // Testing entries with undefined optional fields
    }
  ]

  let onResultsMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '<input id="search-input" />'
    onResultsMock = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return immediately if search input is missing', () => {
    document.body.innerHTML = '' // Remove input
    setupSearch(data, onResultsMock)
    expect(onResultsMock).not.toHaveBeenCalled()
  })

  it('should call onResults immediately with all data when initialized', () => {
    setupSearch(data, onResultsMock)
    expect(onResultsMock).toHaveBeenCalledTimes(1)
    expect(onResultsMock).toHaveBeenCalledWith(data)
  })

  it('should filter by name (English and Persian)', () => {
    setupSearch(data, onResultsMock)
    const input = document.getElementById('search-input') as HTMLInputElement

    input.value = 'ali'
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith([data[0]])

    input.value = 'سارا'
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith([data[1]])
  })

  it('should filter by city (English and Persian)', () => {
    setupSearch(data, onResultsMock)
    const input = document.getElementById('search-input') as HTMLInputElement

    input.value = 'shiraz'
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith([data[1]])

    input.value = 'تهران'
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith([data[0]])
  })

  it('should filter by location (English and Persian)', () => {
    setupSearch(data, onResultsMock)
    const input = document.getElementById('search-input') as HTMLInputElement

    input.value = 'square'
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith([data[0]])

    input.value = 'خیابان'
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith([data[1]])
  })

  it('should filter by bio (English and Persian)', () => {
    setupSearch(data, onResultsMock)
    const input = document.getElementById('search-input') as HTMLInputElement

    input.value = 'student'
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith([data[0]])

    input.value = 'هنرمند'
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith([data[1]])
  })

  it('should handle undefined fields gracefully', () => {
    setupSearch(data, onResultsMock)
    const input = document.getElementById('search-input') as HTMLInputElement

    input.value = 'unknown'
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith([data[2]])
  })

  it('should return all results if input is cleared', () => {
    setupSearch(data, onResultsMock)
    const input = document.getElementById('search-input') as HTMLInputElement

    input.value = 'ali'
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith([data[0]])

    input.value = '  '
    input.dispatchEvent(new Event('input'))
    expect(onResultsMock).toHaveBeenLastCalledWith(data)
  })

  it('should remove old event listener if setupSearch is called multiple times', () => {
    setupSearch(data, onResultsMock)
    // Initial call makes 1 invocation
    expect(onResultsMock).toHaveBeenCalledTimes(1)

    // Call it again
    setupSearch(data, onResultsMock)
    // Second initialization makes another invocation
    expect(onResultsMock).toHaveBeenCalledTimes(2)

    const input = document.getElementById('search-input') as HTMLInputElement
    input.value = 'ali'
    input.dispatchEvent(new Event('input'))

    // The event listener should only fire ONCE, meaning 3 total calls
    expect(onResultsMock).toHaveBeenCalledTimes(3)
  })
})
