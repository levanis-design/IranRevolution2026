import { describe, expect, it } from 'vitest'
import { renderPhotoFigure } from '../detailsMedia'

const t = (key: string, vars?: Record<string, string | number>) => {
  if (key === 'details.photoAlt') return `Photo of ${vars?.name ?? ''}`
  if (key === 'details.photoAttribution') return 'Photo attribution'
  if (key === 'sensitivity.show') return 'Show content'
  if (key === 'sensitivity.mediaWarning') return 'Sensitive media warning'
  return key
}

describe('renderPhotoFigure', () => {
  it('renders all slides without loading attribute for sensitive media carousels', () => {
    const html = renderPhotoFigure({
      photos: ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg'],
      displayName: 'Nika',
      sensitiveMedia: true,
      t
    })

    const container = document.createElement('div')
    container.innerHTML = html

    const images = [...container.querySelectorAll('img')]

    expect(container.querySelector('.sensitive-content')).not.toBeNull()
    expect(images).toHaveLength(3)
    expect(images.map((img) => img.getAttribute('loading'))).toEqual([null, null, null])
  })

  it('deduplicates repeated photos before rendering slides', () => {
    const html = renderPhotoFigure({
      photos: ['https://example.com/1.jpg', 'https://example.com/1.jpg'],
      displayName: 'Nika',
      t
    })

    const container = document.createElement('div')
    container.innerHTML = html

    expect(container.querySelectorAll('.photo-slide')).toHaveLength(1)
    expect(container.querySelector('.slider-dots')).toBeNull()
  })
})
