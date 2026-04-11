import { t } from '../i18n'
import { escapeHTML } from '../domUtils'
import { extractMemorialData } from '../ai'
import { submitMemorial, findDuplicateMemorialClient } from '../dataService'
import { logger } from '../logger'
import type { MemorialEntry } from '../types'

function getFormTemplate(): string {
  return `
    <div class="contribution-form">
      <h2>${t('contribute.title')}</h2>
      <p>${t('contribute.desc')}</p>

      <div class="ai-assistant">
        <div class="form-group">
          <label>${t('ai.extractLabel')}</label>
          <div class="ai-input-group">
            <input type="url" id="ai-url" placeholder="${t('ai.urlPlaceholder')}">
            <button type="button" id="ai-extract-btn" class="ai-button">
              ✨ ${t('ai.button')}
            </button>
          </div>
          <p class="ai-hint">${t('ai.hint')}</p>
        </div>
        <div id="ai-status" class="ai-status hidden"></div>
      </div>

      <hr class="form-divider">

      <form id="victim-form">
        <div class="form-row">
          <div class="form-group">
            <label>${t('contribute.name')}</label>
            <input type="text" name="name" required placeholder="${t('contribute.namePlaceholder') || 'Full Name (English)'}">
            <div id="duplicate-warning" class="duplicate-warning hidden"></div>
          </div>
          <div class="form-group">
            <label>${t('contribute.name')} (${t('languages.fa') || 'Persian'})</label>
            <input type="text" name="name_fa" placeholder="${t('contribute.nameFaPlaceholder') || 'نام کامل (فارسی)'}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>${t('contribute.city')}</label>
            <input type="text" name="city" placeholder="${t('contribute.cityPlaceholder') || 'City'}">
          </div>
          <div class="form-group">
            <label>${t('contribute.date')}</label>
            <input type="date" name="date">
          </div>
        </div>

        <div class="form-group">
          <label>${t('contribute.location')}</label>
          <input type="text" name="location" placeholder="${t('contribute.locationPlaceholder') || 'Specific location (optional)'}">
        </div>

        <div class="form-group">
          <label>${t('contribute.bio')}</label>
          <textarea name="bio" placeholder="${t('contribute.bioPlaceholder') || 'Brief biography or story...'}"></textarea>
        </div>

        <div class="form-group">
          <label>${t('contribute.reference')}</label>
          <input type="url" name="refUrl" required placeholder="${t('contribute.refUrlPlaceholder') || 'Link to X, news, or report for confirmation'}">
          <input type="text" name="refLabel" placeholder="${t('contribute.refLabelPlaceholder') || 'Reference Label (e.g. X Thread, BBC News)'}">
        </div>

        <button type="submit" class="submit-button">${t('contribute.submit')}</button>
      </form>
    </div>
  `
}

function setupDuplicateChecking(
  form: HTMLFormElement,
  currentMemorials: MemorialEntry[],
  onViewDuplicate: (entry: MemorialEntry) => void
) {
  const duplicateWarning = document.getElementById('duplicate-warning') as HTMLDivElement
  const nameInput = form.querySelector('[name="name"]') as HTMLInputElement

  const checkDuplicate = (name: string, city?: string, name_fa?: string) => {
    const currentNameFa = name_fa?.trim() || (form.querySelector('[name="name_fa"]') as HTMLInputElement)?.value.trim() || ''
    const currentCity = city?.toLowerCase().trim() || (form.querySelector('[name="city"]') as HTMLInputElement)?.value.toLowerCase().trim()

    const match = findDuplicateMemorialClient(currentMemorials, name, currentCity, currentNameFa)

    if (match) {
      duplicateWarning.innerHTML = `
        <p>⚠️ ${t('contribute.duplicateWarning')}</p>
        <div class="duplicate-actions">
          <button type="button" class="view-duplicate-btn" data-id="${escapeHTML(match.id)}">
            ${t('details.view')} <strong>${escapeHTML(match.name)}</strong>
          </button>
          <p style="font-size: 0.85rem; margin-top: 0.5rem; color: var(--muted);">
            ${t('contribute.mergeNote') || 'If you submit, your link will be added as a new reference to this person.'}
          </p>
        </div>
      `
      duplicateWarning.classList.remove('hidden')

      duplicateWarning.querySelector('.view-duplicate-btn')?.addEventListener('click', () => {
        const overlay = document.getElementById('modal-overlay')
        overlay?.classList.add('hidden')
        onViewDuplicate(match)
      })
    } else {
      duplicateWarning.classList.add('hidden')
    }
  }

  nameInput?.addEventListener('input', (e) => {
    checkDuplicate((e.target as HTMLInputElement).value)
  })

  form.querySelector('[name="name_fa"]')?.addEventListener('input', (e) => {
    const name = (form.querySelector('[name="name"]') as HTMLInputElement).value
    checkDuplicate(name, undefined, (e.target as HTMLInputElement).value)
  })

  form.querySelector('[name="city"]')?.addEventListener('input', (e) => {
    const name = (form.querySelector('[name="name"]') as HTMLInputElement).value
    const name_fa = (form.querySelector('[name="name_fa"]') as HTMLInputElement).value
    checkDuplicate(name, (e.target as HTMLInputElement).value, name_fa)
  })

  return checkDuplicate
}

function setupAiAssistant(form: HTMLFormElement, checkDuplicate: (name: string, city?: string, name_fa?: string) => void) {
  const aiBtn = document.getElementById('ai-extract-btn') as HTMLButtonElement
  const aiUrl = document.getElementById('ai-url') as HTMLInputElement
  const aiStatus = document.getElementById('ai-status') as HTMLDivElement

  aiBtn?.addEventListener('click', async () => {
    const url = aiUrl.value.trim()

    if (!url) return

    // Create and show loading overlay for the form
    const formContainer = form.parentElement!
    const overlay = document.createElement('div')
    overlay.className = 'form-overlay-loading'
    overlay.innerHTML = `
      <div class="spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
      <span>${t('ai.processing')}...</span>
    `
    formContainer.style.position = 'relative'
    formContainer.appendChild(overlay)

    aiBtn.disabled = true
    aiBtn.innerHTML = `⏳ ${t('ai.processing')}`
    aiStatus.innerHTML = `<div class="spinner"></div> <span>${t('ai.fetching')}</span>`
    aiStatus.className = 'ai-status loading'
    aiStatus.classList.remove('hidden')

    try {
      const victims = await extractMemorialData(url)
      if (!victims || victims.length === 0) {
        throw new Error(t('ai.error'))
      }

      // Use the first victim found to fill the form
      const data = victims[0]

      // Fill form fields
      const nameInput = form.querySelector('[name="name"]') as HTMLInputElement
      const nameFaInput = form.querySelector('[name="name_fa"]') as HTMLInputElement
      const cityInput = form.querySelector('[name="city"]') as HTMLInputElement
      const dateInput = form.querySelector('[name="date"]') as HTMLInputElement
      const locationInput = form.querySelector('[name="location"]') as HTMLInputElement
      const bioInput = form.querySelector('[name="bio"]') as HTMLTextAreaElement
      const refUrlInput = form.querySelector('[name="refUrl"]') as HTMLInputElement
      const refLabelInput = form.querySelector('[name="refLabel"]') as HTMLInputElement

      if (data.name) nameInput.value = data.name
      if (data.name_fa) nameFaInput.value = data.name_fa
      if (data.city) cityInput.value = data.city
      if (data.date) dateInput.value = data.date
      if (data.location) locationInput.value = data.location
      if (data.bio) bioInput.value = data.bio
      refUrlInput.value = url

      const isXUrl = url.includes('x.com') || url.includes('twitter.com')
      const isInstaUrl = url.includes('instagram.com')
      if (data.referenceLabel) {
        refLabelInput.value = data.referenceLabel
      } else {
        refLabelInput.value = isXUrl ? 'X Post' : (isInstaUrl ? 'Instagram' : 'Source')
      }

      if (data.name || data.name_fa) {
        checkDuplicate(data.name || '', data.city, data.name_fa || undefined)
      }

      aiStatus.textContent = t('ai.success')
      aiStatus.className = 'ai-status success'
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'ai.error'
      aiStatus.textContent = t(errorMessage)
      aiStatus.className = 'ai-status error'
    } finally {
      overlay.remove()
      aiBtn.disabled = false
      aiBtn.innerHTML = `✨ ${t('ai.button')}`
    }
  })
}

export function extractFormDataToMemorial(fd: FormData): Partial<MemorialEntry> {
  return {
    name: fd.get('name') as string,
    name_fa: fd.get('name_fa') as string || undefined,
    city: fd.get('city') as string,
    date: fd.get('date') as string,
    location: fd.get('location') as string,
    bio: fd.get('bio') as string,
    media: {
      xPost: fd.get('refUrl')?.toString().includes('x.com') || fd.get('refUrl')?.toString().includes('twitter.com')
        ? fd.get('refUrl') as string
        : undefined
    },
    references: [{
      label: (fd.get('refLabel') as string) || 'Reference',
      url: fd.get('refUrl') as string
    }]
  }
}

function setupFormSubmission(form: HTMLFormElement, body: HTMLElement) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    const data = extractFormDataToMemorial(fd)

    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement
    submitBtn.disabled = true
    submitBtn.textContent = 'Submitting...'

    const result = await submitMemorial(data)

    const overlay = document.getElementById('modal-overlay')

    if (result.success) {
      body.innerHTML = `
        <div class="submission-result">
          <div class="success-icon" style="font-size: 3rem; margin: 1.5rem 0;">✅</div>
          <h3>${t('contribute.successTitle')}</h3>
          <p>${t('contribute.pendingReview') || 'Your contribution has been submitted for review. It will appear on the map once verified by an admin.'}</p>
          <div class="actions" style="margin-top: 2rem;">
            <button id="close-modal-success" class="submit-button" style="max-width: 200px; margin: 0 auto;">${t('details.close')}</button>
          </div>
        </div>
      `

      document.getElementById('close-modal-success')?.addEventListener('click', () => {
        overlay?.classList.add('hidden')
        document.body.style.overflow = ''
        document.body.classList.remove('modal-open')
      })
    } else {
      let errorHint = ''
      if (result.error?.toLowerCase().includes('policy')) {
        errorHint = '<br><small style="color:var(--muted)">Hint: This might be a Database Row-Level Security (RLS) issue. Ensure your Supabase table allows public inserts.</small>'
      }

      body.innerHTML = `
        <div class="submission-result error">
          <div class="error-icon" style="font-size: 3rem; margin: 1.5rem 0;">⚠️</div>
          <h3>${escapeHTML(t('contribute.errorTitle') || 'Submission Failed')}</h3>
          <p>${escapeHTML(result.error || 'An unexpected error occurred. Please try again or submit via GitHub.')}${errorHint}</p>

          <div class="offline-submission" style="margin-top: 1.5rem; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; background: rgba(0,0,0,0.2);">
            <p style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--muted);">You can still submit by copying the data below and opening a GitHub issue:</p>
            <div class="json-preview-container" style="max-height: 200px; overflow-y: auto; text-align: left; background: #111; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
              <code style="font-size: 0.8rem; white-space: pre-wrap;">${escapeHTML(JSON.stringify(data, null, 2))}</code>
            </div>
            <div class="actions" style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
              <button id="copy-json-btn" class="nav-button btn-sm">${t('contribute.copy')}</button>
              <a href="https://github.com/atakhadiviom/IranRevolution2026/issues/new?title=New+Memorial+Submission&body=${encodeURIComponent('Please add this person to the memorial:\n\n```json\n' + JSON.stringify(data, null, 2) + '\n```')}"
                 target="_blank" class="nav-button btn-sm" style="display:inline-block;">
                 Open GitHub Issue
              </a>
            </div>
          </div>

          <div class="actions" style="margin-top: 1.5rem;">
            <button id="close-modal-error" class="submit-button secondary" style="max-width: 200px; margin: 0 auto;">${t('details.close')}</button>
          </div>
        </div>
      `

      document.getElementById('close-modal-error')?.addEventListener('click', () => {
        overlay?.classList.add('hidden')
        document.body.style.overflow = ''
        document.body.classList.remove('modal-open')
      })

      const copyBtn = document.getElementById('copy-json-btn')
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
            const originalText = copyBtn.textContent
            if (originalText !== null) {
              copyBtn.textContent = 'Copied!'
              copyBtn.classList.add('success')
              setTimeout(() => {
                copyBtn.textContent = originalText
                copyBtn.classList.remove('success')
              }, 2000)
            }
          } catch (err) {
            logger.error('Failed to copy:', err)
          }
        })
      }
    }
  })
}

export function renderContributionForm(
  body: HTMLElement,
  currentMemorials: MemorialEntry[],
  onViewDuplicate: (entry: MemorialEntry) => void
) {
  body.innerHTML = getFormTemplate()

  const form = document.getElementById('victim-form') as HTMLFormElement

  if (!form) return

  const checkDuplicate = setupDuplicateChecking(form, currentMemorials, onViewDuplicate)
  setupAiAssistant(form, checkDuplicate)
  setupFormSubmission(form, body)
}
