import { t, currentLanguage } from './i18n'
import type { MemorialEntry } from './types'
import { escapeHTML, sanitizeUrl } from './domUtils'
import { logger } from './logger'
import { renderPhotoFigure, wrapSensitive } from './detailsMedia'
import { downloadMemorialPdf } from './pdf'

export function labelFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('t.me') || host.includes('telegram')) return 'Telegram'
    if (host.includes('x.com') || host.includes('twitter.com')) return 'X (Twitter)'
    if (host.includes('instagram.com')) return 'Instagram'
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube'
    if (host.includes('facebook.com') || host.includes('fb.com')) return 'Facebook'
    if (host.includes('hengaw.net')) return 'Hengaw'
    if (host.includes('iranhr.net')) return 'IranHR'
    if (host.includes('amnesty.org')) return 'Amnesty International'
    if (host.includes('iranwire.com')) return 'IranWire'
    if (host.includes('iranvictims.com')) return 'Iran Victims'
    return host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1)
  } catch {
    return 'Source'
  }
}

function buildProfileHeaderHTML(entry: MemorialEntry, displayName: string, isFa: boolean, date: string): string {
  const displayCity = (isFa && entry.city_fa) ? entry.city_fa : entry.city
  const displayLocation = (isFa && entry.location_fa) ? entry.location_fa : entry.location

  return `
    <header class="profile-header">
      <h2>${escapeHTML(displayName)}</h2>
      <p class="profile-meta">
        <strong>${escapeHTML(t('details.city'))}:</strong> ${escapeHTML(displayCity)}<br>
        <strong>${escapeHTML(t('details.date'))}:</strong> ${escapeHTML(date)}${displayLocation ? `<br>
        <strong>${escapeHTML(t('details.location'))}:</strong> ${escapeHTML(displayLocation)}` : ''}
      </p>
    </header>
  `
}

function buildBioHTML(entry: MemorialEntry, isFa: boolean): string {
  const displayBio = (isFa && entry.bio_fa) ? entry.bio_fa : entry.bio
  if (!displayBio) return ''

  return `
    <div class="profile-bio">
      ${entry.sensitive ? `
        <div class="sensitive-text-gated">
          <div class="sensitive-text-overlay">
            <button class="reveal-btn">${escapeHTML(t('sensitivity.show'))}</button>
          </div>
          <div class="sensitive-text-content">
            <p>${escapeHTML(displayBio)}</p>
          </div>
        </div>
      ` : `<p>${escapeHTML(displayBio)}</p>`}
    </div>
  `
}

function buildActionsHTML(): string {
  return `
    <div class="action-section">
      <div class="candle-section">
        <button id="light-candle" class="candle-button">🕯️ ${escapeHTML(t('details.lightCandle'))}</button>
        <span id="candle-count" class="candle-count">0 ${escapeHTML(t('details.candlesLit'))}</span>
      </div>
      <div class="share-section" style="gap: 8px;">
        <button id="share-btn" class="share-button">
          📤 ${escapeHTML(t('details.share'))}
        </button>
        <button id="download-pdf-btn" class="share-button">
          📄 ${escapeHTML(t('details.downloadPdf'))}
        </button>
      </div>
    </div>
    <div class="report-section">
      <button id="open-report-btn" class="report-link-btn">
         🚩 ${escapeHTML(t('details.reportIssue'))}
      </button>
    </div>
  `
}

function buildMediaAndReferencesHTML(entry: MemorialEntry, isFa: boolean): string {
  let html = ''

  if (entry.media?.video) {
    html += wrapSensitive(`
      <div class="profile-video">
        <h3>${escapeHTML(t('details.video'))}</h3>
        <video controls src="${escapeHTML(entry.media.video)}" aria-label="${escapeHTML(t('details.videoAlt', { name: entry.name }))}"></video>
      </div>
    `, !!entry.sensitiveMedia, 'sensitivity.mediaWarning', t)
  }

  if (entry.media?.xPost) {
    const url = entry.media.xPost
    const isInstagram = url.includes('instagram.com')
    if (isInstagram) {
      html += wrapSensitive(`
        <div class="profile-instagram-post">
          <h3>${escapeHTML(t('details.xPost'))}</h3>
          <blockquote class="instagram-media" data-instgrm-permalink="${escapeHTML(url)}" data-instgrm-version="14" style="background:#FFF; border:0; border-radius:3px; box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin: 1px; max-width:540px; min-width:326px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);">
          </blockquote>
        </div>
      `, !!entry.sensitiveMedia, 'sensitivity.mediaWarning', t)
    } else {
      html += wrapSensitive(`
        <div class="profile-x-post">
          <h3>${escapeHTML(t('details.xPost'))}</h3>
          <blockquote class="twitter-tweet" data-theme="dark" data-dnt="true">
            <a href="${escapeHTML(url)}"></a>
          </blockquote>
        </div>
      `, !!entry.sensitiveMedia, 'sensitivity.mediaWarning', t)
    }
  }

  if (entry.media?.telegramPost) {
    html += wrapSensitive(`
      <div class="profile-telegram-post">
        <h3>${escapeHTML(t('details.telegramPost'))}</h3>
        <div class="telegram-embed-container">
          <iframe src="${escapeHTML(entry.media.telegramPost)}${entry.media.telegramPost.includes('?') ? '&' : '?'}embed=1"
                  frameborder="0"
                  scrolling="no"
                  style="border:none; overflow:hidden; width:100%; height:450px;"></iframe>
        </div>
      </div>
    `, !!entry.sensitiveMedia, 'sensitivity.mediaWarning', t)
  }

  if (entry.references?.length) {
    html += `
      <section class="profile-references">
        <h3>${escapeHTML(t('details.references'))}</h3>
        <ul>
          ${entry.references.map(ref => {
            const label = (!ref.label || ref.label === 'Source') ? labelFromUrl(ref.url) : ref.label
            const safeUrl = sanitizeUrl(ref.url)
            return `<li><a href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)}</a></li>`
          }).join('')}
        </ul>
      </section>
    `
  }

  const displayTestimonials = (isFa && entry.testimonials_fa) ? entry.testimonials_fa : entry.testimonials
  if (displayTestimonials?.length) {
    html += `
      <section class="profile-testimonials">
        <h3>${escapeHTML(t('details.testimonials'))}</h3>
        ${entry.sensitive ? `
          <div class="sensitive-text-gated">
            <div class="sensitive-text-overlay">
              <button class="reveal-btn">${escapeHTML(t('sensitivity.show'))}</button>
            </div>
            <div class="sensitive-text-content">
              ${displayTestimonials.map((s) => `<blockquote>${escapeHTML(s)}</blockquote>`).join('')}
            </div>
          </div>
        ` : displayTestimonials.map((s) => `<blockquote>${escapeHTML(s)}</blockquote>`).join('')}
      </section>
    `
  }

  return html
}

function setupPhotoSlider(panel: HTMLElement) {
  const slider = panel.querySelector('.photo-slider') as HTMLElement | null
  if (!slider) return

  let current = 0
  const slides = slider.querySelectorAll('.photo-slide')
  const dots = slider.querySelectorAll('.slider-dot')
  const counter = slider.querySelector('.slide-counter')
  const total = slides.length

  const goTo = (index: number) => {
    slides[current].classList.remove('active')
    dots[current]?.classList.remove('active')
    current = (index + total) % total
    slides[current].classList.add('active')
    dots[current]?.classList.add('active')
    if (counter) counter.textContent = `${current + 1} / ${total}`
  }

  slider.querySelector('.slider-prev')?.addEventListener('click', () => goTo(current - 1))
  slider.querySelector('.slider-next')?.addEventListener('click', () => goTo(current + 1))
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)))

  let touchX = 0
  slider.addEventListener('touchstart', (e) => { touchX = (e as TouchEvent).touches[0].clientX }, { passive: true })
  slider.addEventListener('touchend', (e) => {
    const diff = touchX - (e as TouchEvent).changedTouches[0].clientX
    if (Math.abs(diff) > 40) goTo(diff > 0 ? current + 1 : current - 1)
  }, { passive: true })
}

function setupSocialWidgets(entry: MemorialEntry, panel: HTMLElement) {
  if (!entry.media?.xPost) return

  if (entry.media.xPost.includes('instagram.com')) {
    const instgrm = window.instgrm
    if (instgrm && instgrm.Embeds) {
      instgrm.Embeds.process()
    } else {
      logger.error('Instagram widgets library NOT ready or not found')
    }
  } else {
    const twttr = window.twttr
    if (twttr && twttr.ready) {
      twttr.ready((t_obj) => {
        t_obj.widgets.load(panel)
      })
    } else {
      logger.error('Twitter widgets library NOT ready or not found')
    }
  }
}

function setupActionListeners(
  entry: MemorialEntry,
  panel: HTMLElement,
  aside: HTMLElement,
  displayName: string,
  onClose: () => void,
  onReport: () => void
) {
  panel.querySelectorAll('.reveal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement
      const container = target.closest('.sensitive-content, .sensitive-text-gated')
      if (container) {
        container.classList.add('revealed')
      }
    })
  })

  document.getElementById('open-report-btn')?.addEventListener('click', onReport)

  const handleClose = () => {
    aside.classList.remove('active')
    onClose()
    const url = new URL(window.location.href)
    url.searchParams.delete('id')
    window.history.replaceState({}, '', url.toString())
  }
  document.getElementById('close-details')?.addEventListener('click', handleClose)
  document.getElementById('back-to-map')?.addEventListener('click', handleClose)

  const shareBtn = document.getElementById('share-btn')
  shareBtn?.addEventListener('click', async () => {
    const shareUrl = new URL(window.location.href)
    shareUrl.searchParams.set('id', entry.id || '')

    const shareData = {
      title: t('details.shareText', { name: displayName }),
      text: t('details.shareText', { name: displayName }),
      url: shareUrl.toString()
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(shareUrl.toString())
        const originalText = shareBtn.innerHTML
        shareBtn.innerHTML = `✅ ${t('details.copied')}`
        setTimeout(() => {
          shareBtn.innerHTML = originalText
        }, 2000)
      }
    } catch (err) {
      logger.error('Error sharing:', err)
    }
  })

  const downloadPdfBtn = document.getElementById('download-pdf-btn')
  downloadPdfBtn?.addEventListener('click', async () => {
    const originalText = downloadPdfBtn.innerHTML
    downloadPdfBtn.innerHTML = `⏳ ${t('ai.processing')}`
    downloadPdfBtn.setAttribute('disabled', 'true')
    try {
      await downloadMemorialPdf(entry)
    } finally {
      downloadPdfBtn.innerHTML = originalText
      downloadPdfBtn.removeAttribute('disabled')
    }
  })

  const candleBtn = document.getElementById('light-candle')
  const candleCount = document.getElementById('candle-count')
  const entryId = entry.id || entry.name.toLowerCase().replace(/\s+/g, '-')

  let countStr = localStorage.getItem(`candle-${entryId}`)
  if (!countStr) {
    const startCount = Math.floor(Math.random() * (1000 - 100 + 1)) + 100
    localStorage.setItem(`candle-${entryId}`, String(startCount))
    countStr = String(startCount)
  }
  let count = Number(countStr)

  if (candleCount) candleCount.textContent = `${count} ${t('details.candlesLit')}`

  candleBtn?.addEventListener('click', () => {
    count++
    localStorage.setItem(`candle-${entryId}`, String(count))
    if (candleCount) candleCount.textContent = `${count} ${t('details.candlesLit')}`
    candleBtn.classList.add('lit')
  }, { once: true })
}

export function renderDetails(entry: MemorialEntry, callbacks: { onClose: () => void, onReport: () => void }) {
  const panel = document.getElementById('details-content')!
  const isFa = currentLanguage() === 'fa'
  const displayName = (isFa && entry.name_fa) ? entry.name_fa : entry.name

  document.title = `${displayName} | ${t('site.title')}`

  const date = new Date(entry.date).toLocaleDateString(isFa ? 'fa-IR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  panel.innerHTML = `
    <div class="panel-header-actions">
      <button id="back-to-map" class="back-button mobile-only" aria-label="${escapeHTML(t('details.backToMap'))}">← ${escapeHTML(t('details.backToMap'))}</button>
      <button id="close-details" class="close-button" aria-label="${escapeHTML(t('details.close'))}">&times;</button>
    </div>
    <article class="memorial-profile">
      ${buildProfileHeaderHTML(entry, displayName, isFa, date)}
      ${renderPhotoFigure({
        photos: entry.media?.photos,
        photo: entry.media?.photo,
        displayName,
        sensitiveMedia: entry.sensitiveMedia,
        t
      })}
      ${buildBioHTML(entry, isFa)}
      ${buildActionsHTML()}
      ${buildMediaAndReferencesHTML(entry, isFa)}
    </article>
  `

  const aside = document.getElementById('details-panel') as HTMLElement
  aside.classList.add('active')
  aside.focus()

  setupPhotoSlider(panel)
  setupSocialWidgets(entry, panel)
  setupActionListeners(entry, panel, aside, displayName, callbacks.onClose, callbacks.onReport)
}

export function clearDetails(memorials: MemorialEntry[]) {
  const panel = document.getElementById('details-content')!
  const total = memorials.length
  const cities = new Set(memorials.map(m => m.city)).size

  panel.innerHTML = `
    <div class="stats-overview">
      <h3>${t('site.title')}</h3>
      <p class="muted">${t('details.empty')}</p>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">${total}</span>
          <span class="stat-label">${t('stats.livesHonored')}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${cities}</span>
          <span class="stat-label">${t('stats.cities')}</span>
        </div>
      </div>
    </div>
  `
}
