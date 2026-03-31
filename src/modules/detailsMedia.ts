import { escapeHTML } from './domUtils'

type TranslateFn = (key: string, vars?: Record<string, string>) => string

function wrapSensitive(content: string, isSensitive: boolean, warning: string, t: TranslateFn) {
  if (!isSensitive) return content

  return `
    <div class="sensitive-content">
      <div class="sensitive-overlay">
        <p class="sensitive-warning">${t(warning)}</p>
        <button class="reveal-btn">${t('sensitivity.show')}</button>
      </div>
      <div class="gated-media">
        ${content}
      </div>
    </div>
  `
}

export function renderPhotoFigure(options: {
  photos?: string[]
  photo?: string
  displayName: string
  sensitiveMedia?: boolean
  t: TranslateFn
}) {
  const allPhotos: string[] = []

  if (options.photos?.length) {
    for (const src of options.photos) {
      if (!allPhotos.includes(src)) allPhotos.push(src)
    }
  } else if (options.photo) {
    allPhotos.push(options.photo)
  }

  if (!allPhotos.length) return ''

  const multi = allPhotos.length > 1

  return wrapSensitive(`
    <figure class="profile-photo${multi ? ' photo-slider' : ''}" data-slide="0">
      <div class="photo-track">
        ${allPhotos.map((src, i) => `
          <div class="photo-slide${i === 0 ? ' active' : ''}">
            <img src="${escapeHTML(src)}" alt="${escapeHTML(options.t('details.photoAlt', { name: options.displayName }))} ${i + 1}" />
          </div>
        `).join('')}
      </div>
      ${multi ? `
        <button class="slider-btn slider-prev" aria-label="Previous photo">&#8249;</button>
        <button class="slider-btn slider-next" aria-label="Next photo">&#8250;</button>
        <div class="slider-dots">
          ${allPhotos.map((_, i) => `<span class="slider-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`).join('')}
        </div>
      ` : ''}
      <figcaption class="photo-attribution">${escapeHTML(options.t('details.photoAttribution'))}${multi ? ` · <span class="slide-counter">1 / ${allPhotos.length}</span>` : ''}</figcaption>
    </figure>
  `, !!options.sensitiveMedia, 'sensitivity.mediaWarning', options.t)
}
