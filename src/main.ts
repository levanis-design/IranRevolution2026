import './style.css'
import { loadTranslations, t, setLanguage, currentLanguage } from './modules/i18n'
import { initMap, plotMarkers, onMarkerSelected, onShowListView, focusOnMarker } from './modules/map'
import type { MemorialEntry } from './modules/types'
import { setupSearch } from './modules/search'
import { fetchMemorials, submitReport, getMemorialById, mapRowToEntry } from './modules/dataService'
import { initTwitter } from './modules/twitter'
import { initInstagram } from './modules/instagram'
import { supabase } from './modules/supabase'
import { escapeHTML } from './modules/domUtils'
import { logger } from './modules/logger'
import { renderDetails, clearDetails } from './modules/details'
import { renderContributionForm } from './modules/contribution/form'

let currentMemorials: MemorialEntry[] = []

async function boot() {
  initTwitter()
  initInstagram()
  await loadTranslations(currentLanguage())
  
  // Initialize UI and Map earlier for better UX and troubleshooting
  initUiText()
  initLanguageSwitcher()
  initMap()
  initListView()
  initContributionForm()
  initFiguresPopup()
  initMobileMenu()
  handleImageErrors()

  // Fetch memorials
  const memorials = await fetchMemorials()
  currentMemorials = memorials
  updateTotalCounter(memorials.length)
  plotMarkers(memorials)
  
  setupSearch(memorials, (filtered) => {
    plotMarkers(filtered)
    const aside = document.getElementById('details-panel') as HTMLElement
    aside.classList.remove('active')
    clearDetails(filtered)
  })

  onMarkerSelected((entry) => {
    renderDetails(entry, { onClose: () => clearDetails(currentMemorials), onReport: () => initReportModal(entry) })
    // Update URL when a memorial is selected
    const url = new URL(window.location.href)
    url.searchParams.set('id', entry.id || '')
    window.history.pushState({}, '', url.toString())

    // Lazy-load full details (bio, references, testimonials) if not fetched yet
    if (entry.id && entry.bio === undefined && (!entry.references || entry.references.length === 0)) {
      getMemorialById(entry.id).then(row => {
        if (!row) return
        const full = mapRowToEntry(row)
        // Update the cached entry so subsequent clicks don't re-fetch
        const idx = currentMemorials.findIndex(m => m.id === entry.id)
        if (idx !== -1) currentMemorials[idx] = full
        renderDetails(full, { onClose: () => clearDetails(currentMemorials), onReport: () => initReportModal(full) })
      })
    }
  })

  setupRealtime()

  // Handle initial URL parameter
  const urlParams = new URLSearchParams(window.location.search)
  const memorialId = urlParams.get('id')
  if (memorialId) {
    const entry = memorials.find(m => m.id === memorialId)
    if (entry) {
      setTimeout(() => {
        focusOnMarker(entry)
        renderDetails(entry, { onClose: () => clearDetails(currentMemorials), onReport: () => initReportModal(entry) })
      }, 500) // Small delay to ensure map is ready
    }
  }
}

function setupRealtime() {
  if (!supabase) return

  supabase
    .channel('memorials-realtime')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'memorials' 
    }, async () => {
       
       // Re-fetch all memorials to ensure consistent state (including order and verification)
      const updatedMemorials = await fetchMemorials()
      currentMemorials = updatedMemorials
      updateTotalCounter(currentMemorials.length)
      
      // Update the map and search
      plotMarkers(currentMemorials)
      setupSearch(currentMemorials, (filtered) => {
        plotMarkers(filtered)
        const aside = document.getElementById('details-panel') as HTMLElement
        aside.classList.remove('active')
        clearDetails(filtered)
      })
    })
    .subscribe()
}

function handleImageErrors() {
  document.addEventListener('error', (e) => {
    const target = e.target as HTMLElement;
    if (target && target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      // Prevent infinite loops if the placeholder itself fails to load
      // Fallback placeholder
      const placeholder = '/Lion.png';
      const placeholderUrl = new URL(placeholder, window.location.href).href;
      if (img.src !== placeholderUrl) {
        img.src = placeholderUrl;
      }
    }
  }, true); // useCapture must be true for error events
}

function initMobileMenu() {
  const menuToggle = document.getElementById('menu-toggle')
  const navControls = document.getElementById('nav-controls')

  if (!menuToggle || !navControls) return

  menuToggle.addEventListener('click', () => {
    const isOpen = menuToggle.classList.contains('open')
    menuToggle.classList.toggle('open')
    navControls.classList.toggle('open')
    menuToggle.setAttribute('aria-expanded', String(!isOpen))
  })

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!menuToggle.contains(target) && !navControls.contains(target)) {
      menuToggle.classList.remove('open')
      navControls.classList.remove('open')
      menuToggle.setAttribute('aria-expanded', 'false')
    }
  })

  // Close menu when a link or button inside is clicked
  navControls.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'SELECT') {
      if (target.tagName !== 'SELECT') {
        menuToggle.classList.remove('open')
        navControls.classList.remove('open')
        menuToggle.setAttribute('aria-expanded', 'false')
      }
    }
  })
}

function initListView() {
  const listViewBtn = document.getElementById('list-view-btn')
  const modalOverlay = document.getElementById('modal-overlay')!
  const modalBody = document.getElementById('modal-body')!
  const modalContent = modalOverlay.querySelector('.modal-content')!

  listViewBtn?.addEventListener('click', () => {
    document.body.style.overflow = 'hidden'
    renderListView(currentMemorials)
  })

  onShowListView((entries) => {
    document.body.style.overflow = 'hidden'
    renderListView(entries)
  })

  function renderListView(entries: MemorialEntry[]) {
    const isFa = currentLanguage() === 'fa'
    modalContent.classList.add('large')
    modalOverlay.classList.remove('hidden')
    
    const sourceCount = (entry: MemorialEntry) => entry.references?.length ?? 0

    const sortItems = (items: MemorialEntry[], sortBy: string) => [...items].sort((a, b) => {
      if (sortBy === 'sources-desc') return sourceCount(b) - sourceCount(a)
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name)
      return 0
    })

    const renderItems = (items: MemorialEntry[]) => {
      if (items.length === 0) {
        return `<div class="list-empty-state">${t('list.noResults')}</div>`
      }
      return items.map(entry => {
        const displayName = (isFa && entry.name_fa) ? entry.name_fa : entry.name
        const displayCity = (isFa && entry.city_fa) ? entry.city_fa : entry.city
        const photo = entry.media?.photo || '/Lion.png'
        const isSensitive = !!entry.sensitiveMedia
        const srcCount = sourceCount(entry)

        return `
          <div class="list-item-card ${isSensitive ? 'list-item-sensitive' : ''}" data-id="${escapeHTML(entry.id)}">
            <div class="list-item-photo-wrapper">
              <img src="${escapeHTML(photo)}" alt="${escapeHTML(displayName)}" class="list-item-photo ${isSensitive ? 'gated-media' : ''}">
              ${isSensitive ? `
                <div class="sensitive-mini-overlay">
                  <span>⚠️</span>
                  <button class="reveal-btn-mini" title="${escapeHTML(t('sensitivity.show'))}">${escapeHTML(t('sensitivity.show'))}</button>
                </div>
              ` : ''}
              ${srcCount > 0 ? `<span class="source-count-badge" title="${srcCount} source${srcCount > 1 ? 's' : ''}">${srcCount}</span>` : ''}
            </div>
            <div class="list-item-info">
              <div class="list-item-name">${escapeHTML(displayName)}</div>
              <div class="list-item-meta">${escapeHTML(displayCity)}</div>
            </div>
          </div>
        `
      }).join('')
    }

    modalBody.innerHTML = `
      <div class="list-view-container">
        <div class="list-view-header">
          <h2>${t('list.title')} (${entries.length} ${t('list.people')})</h2>
        </div>
        <div class="list-view-controls">
          <input type="search" id="list-search" class="list-view-search" placeholder="${t('list.search')}" autofocus>
          <select id="list-sort" class="list-view-sort">
            <option value="sources-desc">Most Sources</option>
            <option value="name-asc">Name (A-Z)</option>
          </select>
        </div>
        <div id="list-grid" class="list-view-grid">
          ${renderItems(sortItems(entries, 'sources-desc'))}
        </div>
      </div>
    `

    const searchInput = document.getElementById('list-search') as HTMLInputElement
    const sortSelect = document.getElementById('list-sort') as HTMLSelectElement
    const grid = document.getElementById('list-grid')!

    const applyFilters = () => {
      const query = searchInput.value.toLowerCase().trim()
      const filtered = entries.filter(e => {
        const name = (e.name || '').toLowerCase()
        const nameFa = (e.name_fa || '').toLowerCase()
        const city = (e.city || '').toLowerCase()
        const cityFa = (e.city_fa || '').toLowerCase()
        return name.includes(query) || nameFa.includes(query) || city.includes(query) || cityFa.includes(query)
      })
      grid.innerHTML = renderItems(sortItems(filtered, sortSelect.value))
    }

    searchInput.addEventListener('input', applyFilters)
    sortSelect.addEventListener('change', applyFilters)

    grid.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const revealBtn = target.closest('.reveal-btn-mini')
      
      if (revealBtn) {
        e.stopPropagation()
        const card = revealBtn.closest('.list-item-card')
        if (card) {
          card.classList.add('revealed')
          card.querySelector('.list-item-photo')?.classList.remove('gated-media')
          revealBtn.closest('.sensitive-mini-overlay')?.remove()
        }
        return
      }

      const card = target.closest('.list-item-card') as HTMLElement
      if (card) {
        const id = card.dataset.id
        const entry = entries.find(item => item.id === id)
        if (entry) {
          modalOverlay.classList.add('hidden')
          modalContent.classList.remove('large')
          document.body.style.overflow = ''
          focusOnMarker(entry)
          renderDetails(entry, { onClose: () => clearDetails(currentMemorials), onReport: () => initReportModal(entry) })
        }
      }
    })
  }

  // Handle modal close to remove 'large' class
  document.getElementById('close-modal')?.addEventListener('click', () => {
    modalContent.classList.remove('large')
  })
  
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalContent.classList.remove('large')
    }
  })
}

function initUiText() {
  const title = document.getElementById('site-title')
  const searchInput = document.getElementById('search-input') as HTMLInputElement
  const footerNote = document.getElementById('footer-note')
  const privacyLink = document.getElementById('privacy-link') as HTMLAnchorElement
  const badge = document.getElementById('total-count-badge')
  const infoTrigger = document.getElementById('info-trigger')
  const listViewBtn = document.getElementById('list-view-btn')
  const contributeBtn = document.getElementById('contribute-btn')

  if (title) title.textContent = t('site.title')
  if (searchInput) searchInput.placeholder = t('search.placeholder')
  if (footerNote) footerNote.textContent = t('site.footerNote')
  if (privacyLink) privacyLink.textContent = t('site.privacy')
  if (listViewBtn) listViewBtn.textContent = t('list.viewAll')
  if (contributeBtn) contributeBtn.textContent = t('contribute.submit')
  if (badge) {
    badge.title = t('stats.livesHonored')
    badge.setAttribute('aria-label', `${t('stats.livesHonored')}: ${badge.textContent}`)
  }
  if (infoTrigger) {
    infoTrigger.title = t('stats.reportedFigures')
    infoTrigger.setAttribute('aria-label', t('stats.reportedFigures'))
  }
}

function updateTotalCounter(count: number) {
  const badge = document.getElementById('total-count-badge')
  if (badge) {
    badge.textContent = count.toString()
    badge.title = t('stats.livesHonored')
    badge.setAttribute('aria-label', `${t('stats.livesHonored')}: ${count}`)
  }
}

function initLanguageSwitcher() {
  const select = document.getElementById('language-select') as HTMLSelectElement
  select.addEventListener('change', async () => {
    await setLanguage(select.value as 'en' | 'fa')
    initUiText()
    plotMarkers(currentMemorials)
    clearDetails(currentMemorials)
    document.documentElement.dir = select.value === 'fa' ? 'rtl' : 'ltr'
    document.documentElement.lang = select.value
  })
}

async function handleReportSubmit(
  e: Event,
  form: HTMLFormElement,
  entry: MemorialEntry,
  statusDiv: HTMLElement,
  closeModal: () => void
) {
  e.preventDefault()
  const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement
  submitBtn.disabled = true
  submitBtn.textContent = '...'

  const formData = new FormData(form)
  const report = {
    memorial_id: entry.id!,
    memorial_name: entry.name,
    reason: formData.get('reason') as string,
    details: formData.get('details') as string
  }

  const { success, error } = await submitReport(report)

  if (success) {
    statusDiv.textContent = t('report.success')
    statusDiv.className = 'report-status success'
    statusDiv.classList.remove('hidden')
    setTimeout(closeModal, 2000)
  } else {
    submitBtn.disabled = false
    submitBtn.textContent = t('report.submit')

    let errorMessage = error || t('report.error')
    if (error?.includes('42P01') || error?.includes('not found')) {
      errorMessage = `⚠️ Database Error: 'reports' table is missing. Please notify the administrator to create the table.`
    } else if (error?.includes('42501') || error?.includes('Permission denied')) {
      errorMessage = `⚠️ Permission Error: The 'reports' table exists but public access is restricted. Please notify the administrator to enable Row-Level Security (RLS) for public inserts.`
    }

    statusDiv.textContent = errorMessage
    statusDiv.className = 'report-status error'
    statusDiv.classList.remove('hidden')

    // Add a fallback link for manual reporting if database fails
    const fallbackLink = document.createElement('a')
    fallbackLink.href = `https://github.com/atakhadiviom/IranRevolution2026/issues/new?title=Report+Issue:+${encodeURIComponent(entry.name)}&body=${encodeURIComponent(`I am reporting an issue with the entry for ${entry.name}${entry.id ? ` (ID: ${entry.id})` : ''}.\n\nReason: ${report.reason}\n\nDetails: ${report.details}`)}`
    fallbackLink.target = '_blank'
    fallbackLink.className = 'report-link-fallback'
    fallbackLink.style.display = 'block'
    fallbackLink.style.marginTop = '1rem'
    fallbackLink.style.fontSize = '0.8rem'
    fallbackLink.style.color = 'var(--muted)'
    fallbackLink.innerHTML = 'Alternative: Click here to report via GitHub'

    if (!statusDiv.querySelector('.report-link-fallback')) {
      statusDiv.appendChild(fallbackLink)
    }
  }
}

function initReportModal(entry: MemorialEntry) {
  const overlay = document.getElementById('report-modal')
  const close = document.getElementById('close-report-modal')
  const body = document.getElementById('report-modal-body')

  if (!overlay || !close || !body) return

  const closeModal = () => {
    overlay.classList.add('hidden')
    document.body.style.overflow = ''
    document.body.classList.remove('modal-open')
  }

  overlay.classList.remove('hidden')
  document.body.style.overflow = 'hidden'
  document.body.classList.add('modal-open')

  close.onclick = closeModal
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal()
  }

  body.innerHTML = `
    <div class="report-form-container">
      <h2>${t('report.title')}</h2>
      <p class="report-desc">${t('report.desc')}</p>
      <form id="report-form">
        <div class="form-group">
          <label>${t('report.reasonLabel')}</label>
          <select name="reason" required>
            <option value="wrong-person">${t('report.reasonWrongPerson')}</option>
            <option value="incorrect-data">${t('report.reasonIncorrectData')}</option>
            <option value="duplicate">${t('report.reasonDuplicate')}</option>
            <option value="sensitive">${t('report.reasonSensitive')}</option>
            <option value="other">${t('report.reasonOther')}</option>
          </select>
        </div>
        <div class="form-group">
          <label>${t('report.detailsLabel')}</label>
          <textarea name="details" placeholder="${t('report.detailsPlaceholder')}"></textarea>
        </div>
        <div id="report-status" class="report-status hidden"></div>
        <button type="submit" class="submit-button">${t('report.submit')}</button>
      </form>
    </div>
  `

  const form = document.getElementById('report-form') as HTMLFormElement
  const statusDiv = document.getElementById('report-status')!

  form.onsubmit = (e) => handleReportSubmit(e, form, entry, statusDiv, closeModal)
}

function initFiguresPopup() {
  const trigger = document.getElementById('info-trigger')
  const overlay = document.getElementById('report-modal')
  const close = document.getElementById('close-report-modal')
  const body = document.getElementById('report-modal-body')

  if (!trigger || !overlay || !close || !body) return

  const openModal = () => {
    overlay.classList.remove('hidden')
    overlay.querySelector('.modal-content')?.classList.add('figures-modal')
    document.body.style.overflow = 'hidden'
    document.body.classList.add('modal-open')
    renderTable()
  }

  const closeModal = () => {
    overlay.classList.add('hidden')
    overlay.querySelector('.modal-content')?.classList.remove('figures-modal')
    document.body.style.overflow = ''
    document.body.classList.remove('modal-open')
  }

  trigger.onclick = openModal
  close.onclick = closeModal
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal()
  }

  function renderTable() {
    const data = [
      { source: t('stats.data.cbs.source'), figure: t('stats.data.cbs.figure'), link: 'https://www.cbsnews.com/news/iran-protest-death-toll-over-12000-feared-higher-video-bodies-at-morgue/', label: t('stats.data.cbs.label') },
      { source: t('stats.data.sundayTimes.source'), figure: t('stats.data.sundayTimes.figure'), link: 'https://www.iranintl.com/en/202601186040', label: t('stats.data.sundayTimes.label') },
      { source: t('stats.data.hrana.source'), figure: t('stats.data.hrana.figure'), link: 'https://www.aa.com.tr/en/middle-east/death-toll-in-iran-protests-at-2-677-human-rights-group/3801006', label: t('stats.data.hrana.label') },
      { source: t('stats.data.iranintl.source'), figure: t('stats.data.iranintl.figure'), link: 'https://www.iranintl.com/en/202601138196', label: t('stats.data.iranintl.label') },
      { source: t('stats.data.ihr.source'), figure: t('stats.data.ihr.figure'), link: 'https://iranhr.net/en/articles/8529/', label: t('stats.data.ihr.label') },
      { source: t('stats.data.khamenei.source'), figure: t('stats.data.khamenei.figure'), link: 'https://www.bbc.com/persian/articles/c1evdd93x6lo', label: t('stats.data.khamenei.label') },
      { source: t('stats.data.ghalibaf.source'), figure: t('stats.data.ghalibaf.figure'), link: 'https://persianepochtimes.com/ghalibaf-says-the-killing-of-thousands-during-irans-national-uprising/', label: t('stats.data.ghalibaf.label') }
    ]

    body!.innerHTML = `
      <div class="reported-figures-container">
        <h2>${t('stats.reportedFigures')}</h2>
        <div class="table-responsive">
          <table class="reported-figures-table">
            <thead>
              <tr>
                <th>${t('stats.source')}</th>
                <th>${t('stats.figure')}</th>
                <th>${t('stats.reference')}</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(row => `
                <tr>
                  <td>${row.source}</td>
                  <td>${row.figure}</td>
                  <td><a href="${row.link}" target="_blank" rel="noopener noreferrer">${row.label}</a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p class="stats-disclaimer">${t('stats.disclaimer')}</p>
      </div>
    `
  }
}

function initContributionForm() {
  const btn = document.getElementById('contribute-btn')
  const fab = document.getElementById('fab-contribute')
  const overlay = document.getElementById('modal-overlay')
  const close = document.getElementById('close-modal')
  const body = document.getElementById('modal-body')
  const modalContent = overlay?.querySelector('.modal-content')

  if (!btn || !overlay || !close || !body || !modalContent) return

  const openModal = () => {
    overlay.classList.remove('hidden')
    document.body.style.overflow = 'hidden'
    document.body.classList.add('modal-open')
    renderForm()
  }

  btn.addEventListener('click', openModal)
  fab?.addEventListener('click', openModal)

  close.addEventListener('click', () => {
    overlay.classList.add('hidden')
    modalContent.classList.remove('large')
    document.body.style.overflow = ''
    document.body.classList.remove('modal-open')
  })

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('hidden')
      modalContent.classList.remove('large')
      document.body.style.overflow = ''
      document.body.classList.remove('modal-open')
    }
  })

  function renderForm() {
    renderContributionForm(body!, currentMemorials, (match) => {
      renderDetails(match, { onClose: () => clearDetails(currentMemorials), onReport: () => initReportModal(match) })
    })
  }

}

boot().catch((e) => {
  logger.error('Failed to boot app', e)
})
