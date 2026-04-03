import { supabase } from './modules/supabase'
import { logger } from './modules/logger'
import { 
  fetchMemorials, 
  verifyMemorial, 
  deleteMemorial, 
  submitMemorial, 
  mergeMemorials,
  batchUpdateImages, 
  batchTranslateMemorials, 
  batchSyncLocationCoords,
  fetchReports,
  updateReportStatus,
  deleteReport,
  findDuplicateMemorialClient
} from './modules/dataService'
import type { ReportRow } from './modules/dataService'
import { extractMemorialData, geocodeLocation } from './modules/ai'
import { extractSocialImage } from './modules/imageExtractor'
import type { MemorialEntry } from './modules/types'
import { escapeHTML } from './modules/domUtils'

// DOM Elements - Sections
const loginSection = document.getElementById('login-section') as HTMLDivElement
const adminSection = document.getElementById('admin-section') as HTMLDivElement
const sections = {
  overview: document.getElementById('section-overview') as HTMLElement,
  submissions: document.getElementById('section-submissions') as HTMLElement,
  memorials: document.getElementById('section-memorials') as HTMLElement,
  editor: document.getElementById('section-editor') as HTMLElement,
  reports: document.getElementById('section-reports') as HTMLElement
}

// DOM Elements - Nav
const navLinks = {
  overview: document.getElementById('nav-overview') as HTMLDivElement,
  submissions: document.getElementById('nav-submissions') as HTMLDivElement,
  memorials: document.getElementById('nav-memorials') as HTMLDivElement,
  editor: document.getElementById('nav-editor') as HTMLDivElement,
  reports: document.getElementById('nav-reports') as HTMLDivElement
}
const mobileMenuToggle = document.getElementById('mobile-menu-toggle') as HTMLButtonElement
const sidebar = document.querySelector('.sidebar') as HTMLElement

// DOM Elements - Stats
const statTotal = document.getElementById('stat-total') as HTMLDivElement
const statVerified = document.getElementById('stat-verified') as HTMLDivElement
const statPending = document.getElementById('stat-pending') as HTMLDivElement
const statReports = document.getElementById('stat-reports') as HTMLDivElement
const refreshStatsBtn = document.getElementById('refresh-stats-btn') as HTMLButtonElement

// DOM Elements - Lists
const submissionsList = document.getElementById('submissions-list') as HTMLTableSectionElement
const verifiedList = document.getElementById('verified-list') as HTMLTableSectionElement
const recentList = document.getElementById('recent-list') as HTMLTableSectionElement
const searchSubmissions = document.getElementById('search-submissions') as HTMLInputElement
const searchMemorials = document.getElementById('search-memorials') as HTMLInputElement
const sortSubmissions = document.getElementById('sort-submissions') as HTMLSelectElement
const sortMemorials = document.getElementById('sort-memorials') as HTMLSelectElement

// DOM Elements - Reports
const reportsList = document.getElementById('reports-list') as HTMLTableSectionElement
const refreshReportsBtn = document.getElementById('refresh-reports-btn') as HTMLButtonElement

// DOM Elements - Auth
const loginForm = document.getElementById('login-form') as HTMLFormElement
const loginError = document.getElementById('login-error') as HTMLParagraphElement
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement
const userEmailSpan = document.getElementById('user-email') as HTMLSpanElement

// DOM Elements - Form
const entryForm = document.getElementById('entry-form') as HTMLFormElement
const editIdInput = document.getElementById('edit-id') as HTMLInputElement
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement
const output = document.getElementById('output') as HTMLPreElement
const editorTitle = document.getElementById('editor-title') as HTMLHeadingElement
const duplicateWarning = document.getElementById('duplicate-warning') as HTMLDivElement
const editorStatus = document.getElementById('editor-status') as HTMLDivElement
const deleteEntryBtn = document.getElementById('delete-entry-btn') as HTMLButtonElement
const mergeEntryBtn = document.getElementById('merge-entry-btn') as HTMLButtonElement
const translateEntryBtn = document.getElementById('translate-entry-btn') as HTMLButtonElement

// Merge Modal Elements
const mergeModal = document.getElementById('merge-modal') as HTMLDivElement
const mergeModalTitle = document.getElementById('merge-modal-title') as HTMLHeadingElement
const mergeTargetSearch = document.getElementById('merge-target-search') as HTMLInputElement
const mergeTargetResults = document.getElementById('merge-target-results') as HTMLDivElement
const cancelMergeBtn = document.getElementById('cancel-merge') as HTMLButtonElement
const confirmMergeBtn = document.getElementById('confirm-merge') as HTMLButtonElement

let currentSourceId: string | null = null
let currentTargetId: string | null = null

// DOM Elements - Quick Import
const aiUrlInput = document.getElementById('ai-url') as HTMLInputElement
const aiExtractBtn = document.getElementById('ai-extract-btn') as HTMLButtonElement
const extractImgBtn = document.getElementById('extract-img-btn') as HTMLButtonElement
const syncCoordsBtn = document.getElementById('sync-coords-btn') as HTMLButtonElement
const batchImgBtn = document.getElementById('batch-img-btn') as HTMLButtonElement
const batchTranslateBtn = document.getElementById('batch-translate-btn') as HTMLButtonElement
const batchCoordsBtn = document.getElementById('batch-coords-btn') as HTMLButtonElement
const findDuplicatesBtn = document.getElementById('find-duplicates-btn') as HTMLButtonElement
const aiStatus = document.getElementById('ai-status') as HTMLDivElement
const jsonImportArea = document.getElementById('json-import') as HTMLTextAreaElement
const jsonImportBtn = document.getElementById('json-import-btn') as HTMLButtonElement

let allMemorials: MemorialEntry[] = []
let allReports: ReportRow[] = []

// --- Auth Logic ---

async function checkUser() {
  if (!supabase) {
    loginError.textContent = 'Supabase connection is not configured. Please check your environment variables.'
    loginError.classList.remove('hidden')
    showLogin()
    return
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    showAdmin(user.email || '')
  } else {
    showLogin()
  }
}

function showLogin() {
  loginSection.classList.remove('hidden')
  adminSection.classList.add('hidden')
}

function showAdmin(email: string) {
  loginSection.classList.add('hidden')
  adminSection.classList.remove('hidden')
  userEmailSpan.textContent = email
  loadData()
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!supabase) {
    loginError.textContent = 'Supabase connection is not configured.'
    loginError.classList.remove('hidden')
    return
  }
  const email = (document.getElementById('email') as HTMLInputElement).value
  const password = (document.getElementById('password') as HTMLInputElement).value
  
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    loginError.textContent = error.message
    loginError.classList.remove('hidden')
  } else {
    checkUser()
  }
})

logoutBtn.addEventListener('click', async () => {
  if (supabase) {
    await supabase.auth.signOut()
  }
  showLogin()
})

// --- Navigation Logic ---

function showSection(sectionName: keyof typeof sections) {
  // Hide all sections
  Object.values(sections).forEach(s => s.classList.add('hidden'))
  // Show target section
  sections[sectionName].classList.remove('hidden')
  
  // Update nav links
  Object.entries(navLinks).forEach(([name, link]) => {
    if (name === sectionName) {
      link.classList.add('active')
    } else {
      link.classList.remove('active')
    }
  })

  // Close sidebar on mobile
  sidebar.classList.remove('active')
}

Object.entries(navLinks).forEach(([name, link]) => {
  link.addEventListener('click', () => showSection(name as keyof typeof sections))
})

mobileMenuToggle.addEventListener('click', (e) => {
  e.stopPropagation()
  sidebar.classList.toggle('active')
})

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  if (sidebar.classList.contains('active') && !sidebar.contains(e.target as Node) && e.target !== mobileMenuToggle) {
    sidebar.classList.remove('active')
  }
})

// --- Dashboard Logic ---

refreshReportsBtn.addEventListener('click', handleRefreshReports)

async function loadData() {
  const loadingHtml = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 2rem;">Loading data...</td></tr>'
  submissionsList.innerHTML = loadingHtml
  verifiedList.innerHTML = loadingHtml
  recentList.innerHTML = loadingHtml

  const [memorials, { error }] = await Promise.all([
    fetchMemorials(true),
    refreshReportsData()
  ])
  allMemorials = memorials
  allMemorials.forEach(m => {
    m._searchName = m.name.toLowerCase()
    m._searchCity = m.city.toLowerCase()
  })
  await updateStats()
  renderSubmissions()
  renderVerified()
  renderRecent()
  renderReports(error)
}

async function handleRefreshReports() {
  refreshReportsBtn.disabled = true
  refreshReportsBtn.textContent = 'Loading...'
  const { error } = await refreshReportsData()
  await renderReports(error)
  await updateStats()
  refreshReportsBtn.disabled = false
  refreshReportsBtn.textContent = 'Refresh Reports'
}

async function refreshReportsData() {
  const { data, error } = await fetchReports()
  if (error) {
    logger.error('Error fetching reports:', error)
    return { error: { message: error } }
  }
  allReports = data || []
  return { success: true }
}

async function renderReports(fetchError?: { message: string }) {
  const reports = allReports

  if (fetchError) {
    reportsList.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 2rem;">Error loading reports: ${escapeHTML(fetchError.message)}</td></tr>`
    return
  }

  if (reports.length === 0) {
    reportsList.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 2rem;">No reports found.</td></tr>'
    return
  }

  const sortedReports = [...reports].sort((a, b) => {
    const aResolved = a.status === 'resolved'
    const bResolved = b.status === 'resolved'
    if (aResolved !== bResolved) {
      return aResolved ? 1 : -1
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  reportsList.innerHTML = sortedReports.map(r => `
    <tr class="data-row">
      <td data-label="Date" style="font-size: 0.85rem; color: var(--muted);">${new Date(r.created_at).toLocaleDateString()}</td>
      <td data-label="Memorial">
        <div style="font-weight: 600;">${escapeHTML(r.memorial_name)}</div>
        <div style="font-size: 0.75rem; color: var(--muted);">ID: ${escapeHTML(r.memorial_id)}</div>
      </td>
      <td data-label="Reason"><span class="badge badge-pending">${escapeHTML(r.reason)}</span></td>
      <td data-label="Details" style="max-width: 300px; font-size: 0.9rem;">${r.details ? escapeHTML(r.details) : '<span style="color:var(--muted)">No details</span>'}</td>
      <td data-label="Status">
        <span class="badge ${r.status === 'resolved' ? 'badge-verified' : r.status === 'dismissed' ? 'badge-muted' : 'badge-pending'}">
          ${escapeHTML(r.status || 'pending')}
        </span>
      </td>
      <td data-label="Actions">
        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button class="btn btn-primary btn-sm view-memorial-btn" data-id="${escapeHTML(r.memorial_id)}">View</button>
          ${r.status !== 'resolved' ? `<button class="btn btn-secondary btn-sm resolve-report-btn" data-id="${escapeHTML(r.id)}">Resolve</button>` : ''}
          <button class="btn btn-danger btn-sm delete-report-btn" data-id="${escapeHTML(r.id)}">Dismiss</button>
        </div>
      </td>
    </tr>
  `).join('')

  reportsList.querySelectorAll('.view-memorial-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLButtonElement).dataset.id!
      editEntry(id)
      showSection('editor')
    })
  })

  reportsList.querySelectorAll('.resolve-report-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLButtonElement).dataset.id!
      const originalText = btn.textContent
      btn.textContent = '...'
      const { success, error } = await updateReportStatus(id, 'resolved')
      if (success) {
        const { error: fetchError } = await refreshReportsData()
        await renderReports(fetchError)
        await updateStats()
      } else {
        alert('Error updating report status: ' + error)
        btn.textContent = originalText
      }
    })
  })

  reportsList.querySelectorAll('.delete-report-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLButtonElement).dataset.id!
      if (confirm('Are you sure you want to dismiss this report?')) {
        const originalText = btn.textContent
        btn.textContent = '...'
        const { success, error } = await deleteReport(id)
        if (success) {
          const { error: fetchError } = await refreshReportsData()
          await renderReports(fetchError)
          await updateStats()
        } else {
          alert('Error dismissing report: ' + error)
          btn.textContent = originalText
        }
      }
    })
  })
}

async function updateStats() {
  const verified = allMemorials.filter(m => m.verified)
  const pending = allMemorials.filter(m => !m.verified)
  const activeReports = allReports.filter(r => r.status === 'pending' || !r.status)
  
  statTotal.textContent = allMemorials.length.toString()
  statVerified.textContent = verified.length.toString()
  statPending.textContent = pending.length.toString()
  statReports.textContent = activeReports.length.toString()
}

function matchesSearchQuery(m: MemorialEntry, query: string): boolean {
  return (m._searchName || m.name.toLowerCase()).includes(query) ||
         (!!m.name_fa && m.name_fa.includes(query)) ||
         (m._searchCity || m.city.toLowerCase()).includes(query)
}

function sortMemorialsList(memorials: MemorialEntry[], sortBy: string) {
  return [...memorials].sort((a, b) => {
    switch (sortBy) {
      case 'date-desc':
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      case 'date-asc':
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      case 'name-asc':
        return a.name.localeCompare(b.name)
      case 'name-desc':
        return b.name.localeCompare(a.name)
      case 'city-asc':
        return a.city.localeCompare(b.city)
      case 'sources-desc':
        return (b.references?.length ?? 0) - (a.references?.length ?? 0)
      default:
        return 0
    }
  })
}

function renderSubmissions() {
  const query = searchSubmissions.value.toLowerCase()
  const sortBy = sortSubmissions.value
  let filtered = allMemorials
    .filter(m => !m.verified)
    .filter(m => matchesSearchQuery(m, query))

  filtered = sortMemorialsList(filtered, sortBy)

  renderTable(filtered, submissionsList)
}

function renderVerified() {
  const query = searchMemorials.value.toLowerCase()
  const sortBy = sortMemorials.value
  let filtered = allMemorials
    .filter(m => m.verified)
    .filter(m => matchesSearchQuery(m, query))

  filtered = sortMemorialsList(filtered, sortBy)

  renderTable(filtered, verifiedList)
}

function renderRecent() {
  const recent = [...allMemorials]
    .sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
      return dateB - dateA
    })
    .slice(0, 5)

  if (recent.length === 0) {
    recentList.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 1rem;">No activity yet.</td></tr>'
    return
  }

  recentList.innerHTML = recent.map(m => `
    <tr>
      <td data-label="Name"><div style="font-weight: 600;">${escapeHTML(m.name)}</div></td>
      <td data-label="City">${escapeHTML(m.city)}</td>
      <td data-label="Submitted At" style="font-size: 0.85rem; color: var(--muted);">${m.created_at ? new Date(m.created_at).toLocaleDateString() : 'Unknown'}</td>
      <td data-label="Status">
        <span class="badge ${m.verified ? 'badge-verified' : 'badge-pending'}">
          ${m.verified ? 'Verified' : 'Pending'}
        </span>
      </td>
    </tr>
  `).join('')
}

function renderTable(memorials: MemorialEntry[], container: HTMLTableSectionElement) {
  if (memorials.length === 0) {
    container.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--muted); padding: 2rem;">No entries found.</td></tr>'
    return
  }

  container.innerHTML = memorials.map(m => {
    const srcCount = m.references?.length ?? 0
    const credColor = srcCount >= 3 ? 'var(--verified)' : srcCount >= 2 ? '#f59e0b' : 'var(--muted)'
    return `
    <tr class="data-row">
      <td data-label="Name">
        <div style="font-weight: 600;">${escapeHTML(m.name)}</div>
        <div style="font-size: 0.8rem; color: var(--muted);" dir="rtl">${escapeHTML(m.name_fa || '')}</div>
      </td>
      <td data-label="City">${escapeHTML(m.city)}</td>
      <td data-label="Date">${escapeHTML(m.date)}</td>
      <td data-label="Sources" title="${srcCount} source${srcCount !== 1 ? 's' : ''}">
        <span style="font-weight:600;color:${credColor}">${srcCount}</span>
        <span style="font-size:0.75rem;color:var(--muted)"> src</span>
      </td>
      <td data-label="Status">
        <span class="badge ${m.verified ? 'badge-verified' : 'badge-pending'}">
          ${m.verified ? 'Verified' : 'Pending'}
        </span>
      </td>
      <td data-label="Actions">
        <div style="display: flex; gap: 0.4rem; justify-content: flex-end; flex-wrap: nowrap;">
          <button class="btn btn-secondary btn-sm edit-btn" data-id="${escapeHTML(m.id)}">Edit</button>
          ${!m.verified ? `<button class="btn btn-primary btn-sm verify-btn" data-id="${escapeHTML(m.id)}">Verify</button>` : ''}
          <button class="btn btn-secondary btn-sm merge-btn" data-id="${escapeHTML(m.id)}" title="Merge references into another entry">Merge</button>
          <button class="btn btn-danger btn-sm delete-btn" data-id="${escapeHTML(m.id)}">Delete</button>
        </div>
      </td>
    </tr>`
  }).join('')

  // Add event listeners
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => editEntry((btn as HTMLButtonElement).dataset.id!))
  })
  container.querySelectorAll('.verify-btn').forEach(btn => {
    btn.addEventListener('click', () => handleVerify((btn as HTMLButtonElement).dataset.id!))
  })
  container.querySelectorAll('.merge-btn').forEach(btn => {
    btn.addEventListener('click', () => openMergeModal((btn as HTMLButtonElement).dataset.id!))
  })
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => handleDelete((btn as HTMLButtonElement).dataset.id!))
  })
}

function openMergeModal(id: string) {
  const source = allMemorials.find(m => m.id === id)
  if (!source) return

  currentSourceId = id
  currentTargetId = null
  mergeModalTitle.textContent = `Merge: ${source.name}`
  mergeTargetSearch.value = source.name // Pre-fill with name to find duplicates
  mergeModal.classList.remove('hidden')
  confirmMergeBtn.disabled = true
  updateMergeResults()
}

function updateMergeResults() {
  const query = mergeTargetSearch.value.toLowerCase().trim()
  const results = allMemorials
    .filter(m => m.id !== currentSourceId)
    .filter(m => matchesSearchQuery(m, query))
    .slice(0, 10)

  if (results.length === 0) {
    mergeTargetResults.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--muted);">No matching people found.</div>'
    return
  }

  mergeTargetResults.innerHTML = results.map(m => `
    <div class="merge-result-item ${m.id === currentTargetId ? 'selected' : ''}" 
         data-id="${escapeHTML(m.id)}"
         style="padding: 0.75rem; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;">
      <div style="font-weight: 600;">${escapeHTML(m.name)} ${m.verified ? '✅' : '⏳'}</div>
      <div style="font-size: 0.8rem; color: var(--muted);">${escapeHTML(m.city)} | ${escapeHTML(m.date)}</div>
    </div>
  `).join('')

  // Add styles for selection
  const style = document.createElement('style')
  style.textContent = `
    .merge-result-item:hover { background: rgba(255,255,255,0.05); }
    .merge-result-item.selected { background: var(--accent) !important; color: white !important; }
    .merge-result-item.selected .muted { color: rgba(255,255,255,0.8); }
  `
  document.head.appendChild(style)

  mergeTargetResults.querySelectorAll('.merge-result-item').forEach(item => {
    item.addEventListener('click', () => {
      currentTargetId = (item as HTMLDivElement).dataset.id!
      confirmMergeBtn.disabled = false
      updateMergeResults()
    })
  })
}

mergeTargetSearch.addEventListener('input', updateMergeResults)

cancelMergeBtn.addEventListener('click', () => {
  mergeModal.classList.add('hidden')
  currentSourceId = null
  currentTargetId = null
})

confirmMergeBtn.addEventListener('click', async () => {
  if (!currentSourceId || !currentTargetId) return
  
  const source = allMemorials.find(m => m.id === currentSourceId)
  const target = allMemorials.find(m => m.id === currentTargetId)
  
  if (!confirm(`Merge references from "${source?.name}" into "${target?.name}"?\n\nThis will delete the entry for "${source?.name}".`)) {
    return
  }

  confirmMergeBtn.disabled = true
  confirmMergeBtn.textContent = 'Merging...'
  
  const { success, error } = await mergeMemorials(currentSourceId, currentTargetId)
  
  if (success) {
    alert('Merged successfully!')
    mergeModal.classList.add('hidden')
    loadData()
  } else {
    alert(`Error: ${error}`)
  }
  
  confirmMergeBtn.disabled = false
  confirmMergeBtn.textContent = 'Confirm Merge'
})

navLinks.editor.addEventListener('click', () => {
  clearForm()
  editEntry('')
  showSection('editor')
})

function editEntry(id: string) {
  // Show translate button always (for new entries and editing)
  translateEntryBtn.classList.remove('hidden')
  
  if (id) {
    // Show delete and merge buttons only when editing existing entry
    deleteEntryBtn.classList.remove('hidden')
    mergeEntryBtn.classList.remove('hidden')
    
    const entry = allMemorials.find(m => m.id === id)
    if (!entry) return

    editIdInput.value = entry.id || ''
    editorTitle.textContent = `Edit: ${entry.name}`
    
    ;(document.getElementById('name') as HTMLInputElement).value = entry.name
    ;(document.getElementById('name_fa') as HTMLInputElement).value = entry.name_fa || ''
    ;(document.getElementById('city') as HTMLInputElement).value = entry.city
    ;(document.getElementById('city_fa') as HTMLInputElement).value = entry.city_fa || ''
    ;(document.getElementById('location') as HTMLInputElement).value = entry.location || ''
    ;(document.getElementById('location_fa') as HTMLInputElement).value = entry.location_fa || ''
    ;(document.getElementById('date') as HTMLInputElement).value = entry.date
    ;(document.getElementById('lat') as HTMLInputElement).value = (entry.coords?.lat || 35.6892).toString()
    ;(document.getElementById('lon') as HTMLInputElement).value = (entry.coords?.lon || 51.3890).toString()
    ;(document.getElementById('bio') as HTMLTextAreaElement).value = entry.bio || ''
    ;(document.getElementById('bio_fa') as HTMLTextAreaElement).value = entry.bio_fa || ''
    ;(document.getElementById('testimonials') as HTMLTextAreaElement).value = entry.testimonials?.join('\n') || ''
    ;(document.getElementById('photo') as HTMLInputElement).value = entry.media?.photo || ''
    ;(document.getElementById('xPost') as HTMLInputElement).value = entry.media?.xPost || ''
    ;(document.getElementById('references') as HTMLTextAreaElement).value = 
      entry.references?.map(r => `${r.label} | ${r.url}`).join('\n') || ''
    ;(document.getElementById('verified') as HTMLInputElement).checked = entry.verified || false
    ;(document.getElementById('sensitive') as HTMLInputElement).checked = entry.sensitive || false
    ;(document.getElementById('sensitive-media') as HTMLInputElement).checked = entry.sensitiveMedia || false
    
    output.textContent = JSON.stringify(entry, null, 2)
    checkDuplicate(entry.name, entry.city)
  } else {
    // Adding new entry
    editorTitle.textContent = 'Add Memorial Entry'
    deleteEntryBtn.classList.add('hidden')
    mergeEntryBtn.classList.add('hidden')
  }
  
  editorStatus.classList.add('hidden')
  showSection('editor')
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function checkDuplicate(name: string, city?: string, name_fa?: string) {
  const currentNameFa = name_fa?.trim() || (document.getElementById('name_fa') as HTMLInputElement)?.value.trim() || ''
  const currentCity = city?.toLowerCase().trim() || (document.getElementById('city') as HTMLInputElement)?.value.toLowerCase().trim()

  const match = findDuplicateMemorialClient(allMemorials, name, currentCity, currentNameFa, editIdInput.value)

  if (match) {
    duplicateWarning.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <div>⚠️ <strong>Duplicate Found:</strong> ${escapeHTML(match.name)} (${escapeHTML(match.city)})</div>
        <div style="font-size: 0.8rem; opacity: 0.9;">
          If you save, this new entry will be <strong>merged</strong> into the existing one as a new reference.
        </div>
        <button type="button" class="btn btn-secondary btn-sm edit-match-btn" style="align-self: flex-start;">
          Edit Existing Instead
        </button>
      </div>
    `
    duplicateWarning.classList.remove('hidden')
    
    duplicateWarning.querySelector('.edit-match-btn')?.addEventListener('click', () => {
      editEntry(match.id!)
    })
  } else {
    duplicateWarning.classList.add('hidden')
  }
}

document.getElementById('name')?.addEventListener('input', (e) => {
  checkDuplicate((e.target as HTMLInputElement).value)
})

document.getElementById('name_fa')?.addEventListener('input', (e) => {
  const name = (document.getElementById('name') as HTMLInputElement).value
  checkDuplicate(name, undefined, (e.target as HTMLInputElement).value)
})

document.getElementById('city')?.addEventListener('input', (e) => {
  const name = (document.getElementById('name') as HTMLInputElement).value
  const name_fa = (document.getElementById('name_fa') as HTMLInputElement).value
  checkDuplicate(name, (e.target as HTMLInputElement).value, name_fa)
})

document.getElementById('references')?.addEventListener('input', (e) => {
  const text = (e.target as HTMLTextAreaElement).value
  const xPostInput = document.getElementById('xPost') as HTMLInputElement
  
  // Only autofill if currently empty or if we are likely typing/extending the same URL
  const currentVal = xPostInput.value.trim()
  
  const lines = text.split('\n')
  for (const line of lines) {
    const parts = line.split('|')
    if (parts.length >= 2) {
      const url = parts[1].trim()
      if (url.includes('x.com') || url.includes('twitter.com') || url.includes('instagram.com') || url.includes('t.me/')) {
        if (!currentVal || url.startsWith(currentVal) || currentVal.startsWith(url)) {
          xPostInput.value = url
        }
        break
      }
    }
  }
})

searchSubmissions.addEventListener('input', renderSubmissions)
searchMemorials.addEventListener('input', renderVerified)
sortSubmissions.addEventListener('change', renderSubmissions)
sortMemorials.addEventListener('change', renderVerified)
refreshStatsBtn.addEventListener('click', loadData)

// --- Quick Import Logic ---

aiExtractBtn.addEventListener('click', async () => {
  const url = aiUrlInput.value.trim()
  if (!url) return

  aiExtractBtn.disabled = true
  aiExtractBtn.textContent = '...'
  aiStatus.textContent = '✨ Extracting data with AI...'
  aiStatus.className = 'loading'
  aiStatus.classList.remove('hidden')

  try {
    const victims = await extractMemorialData(url)
    if (!victims || victims.length === 0) {
      throw new Error('No memorial data found at this URL.')
    }
    
    // For the quick import form, we take the first victim
    const data = victims[0]
    populateForm(data)
    
    // Add reference automatically
    const refsArea = document.getElementById('references') as HTMLTextAreaElement
    const existingRefs = refsArea.value.trim()
    const isXUrl = url.includes('x.com') || url.includes('twitter.com')
    const isInstaUrl = url.includes('instagram.com')
    const isTelegramUrl = url.includes('t.me/')
    const sourceLabel = data.referenceLabel || (isXUrl ? 'X Post' : (isInstaUrl ? 'Instagram' : (isTelegramUrl ? 'Telegram' : 'Source')))
    const newRef = `${sourceLabel} | ${url}`
    refsArea.value = existingRefs ? `${existingRefs}\n${newRef}` : newRef
    
    if (isXUrl || isInstaUrl || isTelegramUrl) {
      (document.getElementById('xPost') as HTMLInputElement).value = url
    } else {
      (document.getElementById('xPost') as HTMLInputElement).value = ''
    }

    // Try to geocode if needed
    const latInput = document.getElementById('lat') as HTMLInputElement
    const lonInput = document.getElementById('lon') as HTMLInputElement
    if (!latInput.value || latInput.value === '35.6892') {
      if (data.city) {
        aiStatus.textContent = '📍 Syncing coordinates...'
        const coords = await geocodeLocation(data.city, data.location || '')
        if (coords) {
          latInput.value = coords.lat.toString()
          lonInput.value = coords.lon.toString()
        }
      }
    }

    aiStatus.textContent = '✅ Extraction successful!'
    aiStatus.className = 'success'
    
    // Switch to editor automatically
    setTimeout(() => {
      showSection('editor')
      aiStatus.classList.add('hidden')
      aiUrlInput.value = ''
    }, 1500)

  } catch (error) {
    let msg = error instanceof Error ? error.message : 'Unknown error'
    if (msg === 'ai.error.blocked') {
      msg = 'Could not access the content of this URL. It might be private or protected.'
    }
    aiStatus.textContent = '❌ Extraction failed: ' + msg
    aiStatus.className = 'error'
  } finally {
    aiExtractBtn.disabled = false
    aiExtractBtn.textContent = 'Extract'
  }
})

extractImgBtn.addEventListener('click', async () => {
  const url = (document.getElementById('xPost') as HTMLInputElement).value.trim()
  if (!url) {
    alert('Please enter an X, Instagram, or Telegram URL first.')
    return
  }

  extractImgBtn.disabled = true
  const originalText = extractImgBtn.textContent
  extractImgBtn.textContent = '...'
  
  try {
    const imageUrl = await extractSocialImage(url)
    if (imageUrl) {
      (document.getElementById('photo') as HTMLInputElement).value = imageUrl
      alert('Image extracted successfully!')
    } else {
      alert('Could not find an image in this post. The URL might be private or protected.')
    }
  } catch (e) {
    alert('Failed to extract image: ' + (e instanceof Error ? e.message : String(e)))
  } finally {
    extractImgBtn.disabled = false
    extractImgBtn.textContent = originalText
  }
})

syncCoordsBtn.addEventListener('click', async () => {
  const city = (document.getElementById('city') as HTMLInputElement).value.trim()
  const location = (document.getElementById('location') as HTMLInputElement).value.trim()
  if (!city) {
    alert('City is required to sync coordinates.')
    return
  }

  syncCoordsBtn.disabled = true
  const originalText = syncCoordsBtn.textContent
  syncCoordsBtn.textContent = '...'

  try {
    const coords = await geocodeLocation(city, location)
    if (coords) {
      (document.getElementById('lat') as HTMLInputElement).value = `${coords.lat}`;
      (document.getElementById('lon') as HTMLInputElement).value = `${coords.lon}`;
      alert('Coordinates synced!');
    } else {
      alert('Could not find coordinates for this location.')
    }
  } catch (e) {
    alert('Failed to sync coordinates: ' + (e instanceof Error ? e.message : String(e)))
  } finally {
    syncCoordsBtn.disabled = false
    syncCoordsBtn.textContent = originalText
  }
})

batchImgBtn.addEventListener('click', async () => {
  if (!confirm('Sync images for all memorials? This might take a while.')) return
  batchImgBtn.disabled = true
  const originalText = batchImgBtn.textContent
  batchImgBtn.textContent = '⌛ Processing...'
  try {
    const { success, count, error } = await batchUpdateImages()
    if (success) {
      alert(`Successfully updated ${count} memorials!`)
      loadData()
    } else alert(`Failed: ${error}`)
  } catch (e) { alert('Failed: ' + (e instanceof Error ? e.message : String(e))) } finally {
    batchImgBtn.disabled = false 
    batchImgBtn.textContent = originalText
  }
})

batchTranslateBtn.addEventListener('click', async () => {
  if (!confirm('Use AI to fix missing translations?')) return
  batchTranslateBtn.disabled = true
  const originalText = batchTranslateBtn.textContent
  batchTranslateBtn.textContent = '⌛ Processing...'
  try {
    const { success, count, error } = await batchTranslateMemorials()
    if (success) {
      alert(`Successfully translated ${count} memorials!`)
      loadData()
    } else alert(`Failed: ${error}`)
  } catch (e) { alert('Failed: ' + (e instanceof Error ? e.message : String(e))) } finally {
    batchTranslateBtn.disabled = false 
    batchTranslateBtn.textContent = originalText
  }
})

batchCoordsBtn.addEventListener('click', async () => {
  if (!confirm('Use AI to sync all coordinates?')) return
  batchCoordsBtn.disabled = true
  const originalText = batchCoordsBtn.textContent
  batchCoordsBtn.textContent = '⌛ Processing...'
  try {
    const { success, count, error } = await batchSyncLocationCoords()
    if (success) {
      alert(`Successfully synced ${count} memorials!`)
      loadData()
    } else alert(`Failed: ${error}`)
  } catch (e) { alert('Failed: ' + (e instanceof Error ? e.message : String(e))) } finally {
    batchCoordsBtn.disabled = false 
    batchCoordsBtn.textContent = originalText
  }
})

findDuplicatesBtn.addEventListener('click', () => {
  const duplicates: Record<string, MemorialEntry[]> = {}
  
  allMemorials.forEach(m => {
    if (!m.name_fa) return
    const nameFa = m.name_fa.trim()
    if (nameFa.length < 2) return
    
    if (!duplicates[nameFa]) {
      duplicates[nameFa] = []
    }
    duplicates[nameFa].push(m)
  })

  const duplicateGroups = Object.entries(duplicates)
    .filter(([_, group]) => group.length > 1)
    .sort((a, b) => b[1].length - a[1].length)

  if (duplicateGroups.length === 0) {
    alert('No duplicates found based on Persian name.')
    return
  }

  let report = `🔍 Found ${duplicateGroups.length} groups of potential duplicates by Persian name:\n\n`
  duplicateGroups.forEach(([nameFa, group]) => {
    report += `--- ${nameFa} (${group.length} entries) ---\n`
    group.forEach(m => {
      report += `${m.verified ? '✅' : '⏳'} ${m.name} | ${m.city} | ID: ${m.id}\n`
    })
    report += '\n'
  })

  output.textContent = report
  showSection('editor')
  
  // Scroll to output
  setTimeout(() => {
    output.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 100)
})

jsonImportBtn.addEventListener('click', async () => {
  const raw = jsonImportArea.value.trim()
  if (!raw) return
  try {
    const data = JSON.parse(raw) as Partial<MemorialEntry>
    if (!data.name || !data.city || !data.date) {
      alert('Error: JSON must contain name, city, and date.')
      return
    }
    data.verified = true
    jsonImportBtn.disabled = true
    const { success, merged, error } = await submitMemorial(data)
    if (success) {
      jsonImportArea.value = ''
      alert(merged ? 'Merged into existing entry successfully!' : 'Memorial saved successfully!')
      loadData()
    } else alert(`Error: ${error}`)
  } catch (e) { alert('Invalid JSON format: ' + (e instanceof Error ? e.message : String(e))) } finally { jsonImportBtn.disabled = false }
})

function populateForm(data: Partial<MemorialEntry> & { referenceLabel?: string; photo?: string }) {
  const fields: Record<string, string | number | undefined> = {
    name: data.name,
    name_fa: data.name_fa,
    city: data.city,
    city_fa: data.city_fa,
    location: data.location,
    location_fa: data.location_fa,
    date: data.date,
    lat: data.coords?.lat,
    lon: data.coords?.lon,
    bio: data.bio,
    bio_fa: data.bio_fa,
    photo: data.media?.photo || data.photo,
    xPost: data.media?.xPost || data.media?.telegramPost
  }

  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement
    if (el && val !== undefined) el.value = val.toString()
  })

  if (Array.isArray(data.testimonials)) {
    (document.getElementById('testimonials') as HTMLTextAreaElement).value = data.testimonials.join('\n')
  }
  if (Array.isArray(data.references)) {
    (document.getElementById('references') as HTMLTextAreaElement).value = 
      data.references.map((r) => `${r.label} | ${r.url}`).join('\n')
  }

  if (data.name || data.name_fa) {
    checkDuplicate(data.name || '', data.city, data.name_fa || undefined)
  }
}

async function handleVerify(id: string) {
  if (!confirm('Verify this entry?')) return
  const { success, merged, error } = await verifyMemorial(id)
  if (success) {
    alert(merged ? 'Merged into existing verified entry!' : 'Verified!')
    loadData()
  } else alert(`Error: ${error}`)
}

async function handleDelete(id: string) {
  if (!confirm('Delete this entry?')) return
  const { success, error } = await deleteMemorial(id)
  if (success) {
    alert('Deleted!')
    loadData()
  } else alert(`Error: ${error}`)
}

entryForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = (document.getElementById('name') as HTMLInputElement).value.trim()
  const xPostValue = (document.getElementById('xPost') as HTMLInputElement).value.trim()
  
  let xPost = ''
  let telegramPost = ''

  if (xPostValue) {
    if (xPostValue.includes('t.me/')) {
      telegramPost = xPostValue
    } else {
      xPost = xPostValue
    }
  }

  const rawRefs = (document.getElementById('references') as HTMLTextAreaElement).value.trim()

  const references = rawRefs.split('\n').map(line => {
    const parts = line.split('|')
    if (parts.length >= 2) {
      const label = parts[0].trim()
      const url = parts.slice(1).join('|').trim() // Join rest in case URL contains |
      if (label && url) {
        return { label, url }
      }
    }
    return null
  }).filter(Boolean) as { label: string, url: string }[]

  if (!name || (!xPostValue && references.length === 0)) {
    alert('Name and at least one link required.')
    return
  }

  const entry: Partial<MemorialEntry> = {
    id: editIdInput.value || undefined,
    name,
    name_fa: (document.getElementById('name_fa') as HTMLInputElement).value.trim() || undefined,
    city: (document.getElementById('city') as HTMLInputElement).value.trim(),
    city_fa: (document.getElementById('city_fa') as HTMLInputElement).value.trim() || undefined,
    location: (document.getElementById('location') as HTMLInputElement).value.trim() || undefined,
    location_fa: (document.getElementById('location_fa') as HTMLInputElement).value.trim() || undefined,
    date: (document.getElementById('date') as HTMLInputElement).value,
    coords: {
      lat: Number((document.getElementById('lat') as HTMLInputElement).value),
      lon: Number((document.getElementById('lon') as HTMLInputElement).value)
    },
    bio: (document.getElementById('bio') as HTMLTextAreaElement).value.trim() || undefined,
    bio_fa: (document.getElementById('bio_fa') as HTMLTextAreaElement).value.trim() || undefined,
    testimonials: (document.getElementById('testimonials') as HTMLTextAreaElement).value.trim()
      .split('\n').map(s => s.trim()).filter(Boolean),
    media: {
      photo: (document.getElementById('photo') as HTMLInputElement).value.trim() || undefined,
      xPost: xPost || undefined,
      telegramPost: telegramPost || undefined
    },
    references: references.length > 0 ? references : undefined,
    verified: (document.getElementById('verified') as HTMLInputElement).checked,
    sensitive: (document.getElementById('sensitive') as HTMLInputElement).checked,
    sensitiveMedia: (document.getElementById('sensitive-media') as HTMLInputElement).checked
  }

  output.textContent = JSON.stringify(entry, null, 2)
  const { success, merged, error } = await submitMemorial(entry)
  if (success) {
    alert(merged ? 'Merged into existing entry successfully!' : 'Saved successfully!')
    clearForm()
    loadData()
    showSection('overview')
  } else alert(`Error: ${error}`)
})

function clearForm() {
  entryForm.reset()
  editIdInput.value = ''
  editorTitle.textContent = 'Add Memorial Entry'
  output.textContent = ''
  duplicateWarning.classList.add('hidden')
  editorStatus.classList.add('hidden')
  deleteEntryBtn.classList.add('hidden')
  mergeEntryBtn.classList.add('hidden')
  translateEntryBtn.classList.add('hidden')
  ;(document.getElementById('lat') as HTMLInputElement).value = '35.6892'
  ;(document.getElementById('lon') as HTMLInputElement).value = '51.3890'
  ;(document.getElementById('sensitive') as HTMLInputElement).checked = false
  ;(document.getElementById('sensitive-media') as HTMLInputElement).checked = false
}

deleteEntryBtn.addEventListener('click', () => {
  if (editIdInput.value) {
    handleDelete(editIdInput.value)
    clearForm()
    showSection('overview')
  }
})

mergeEntryBtn.addEventListener('click', () => {
  if (editIdInput.value) {
    openMergeModal(editIdInput.value)
  }
})

translateEntryBtn.addEventListener('click', async () => {
  const nameEl = document.getElementById('name') as HTMLInputElement
  const nameFaEl = document.getElementById('name_fa') as HTMLInputElement
  const cityEl = document.getElementById('city') as HTMLInputElement
  const cityFaEl = document.getElementById('city_fa') as HTMLInputElement
  const locationEl = document.getElementById('location') as HTMLInputElement
  const locationFaEl = document.getElementById('location_fa') as HTMLInputElement
  const bioEl = document.getElementById('bio') as HTMLTextAreaElement
  const bioFaEl = document.getElementById('bio_fa') as HTMLTextAreaElement

  const name = nameEl.value.trim()
  const name_fa = nameFaEl.value.trim()
  const city = cityEl.value.trim()
  const city_fa = cityFaEl.value.trim()
  const location = locationEl.value.trim()
  const location_fa = locationFaEl.value.trim()
  const bio = bioEl.value.trim()
  const bio_fa = bioFaEl.value.trim()

  if (!name && !name_fa && !city && !city_fa && !location && !location_fa && !bio && !bio_fa) {
    alert('Please fill some fields to translate.')
    return
  }

  translateEntryBtn.disabled = true
  const originalText = translateEntryBtn.textContent
  translateEntryBtn.textContent = '...'
  
  editorStatus.textContent = '🌍 Translating with AI...'
  editorStatus.className = 'loading'
  editorStatus.classList.remove('hidden')

  try {
    const { translateMemorialData } = await import('./modules/ai')
    const result = await translateMemorialData({ 
      name: name || undefined,
      name_fa: name_fa || undefined, 
      city: city || undefined,
      city_fa: city_fa || undefined, 
      location: location || undefined,
      location_fa: location_fa || undefined, 
      bio: bio || undefined,
      bio_fa: bio_fa || undefined 
    })

    if (result) {
      const t = result
      // Only fill empty fields
      if (!name && t.name) nameEl.value = t.name
      if (!name_fa && t.name_fa) nameFaEl.value = t.name_fa
      if (!city && t.city) cityEl.value = t.city
      if (!city_fa && t.city_fa) cityFaEl.value = t.city_fa
      if (!location && t.location) locationEl.value = t.location
      if (!location_fa && t.location_fa) locationFaEl.value = t.location_fa
      if (!bio && t.bio) bioEl.value = t.bio
      if (!bio_fa && t.bio_fa) bioFaEl.value = t.bio_fa
      
      editorStatus.textContent = '✅ Translation complete!'
      editorStatus.className = 'success'
      setTimeout(() => editorStatus.classList.add('hidden'), 3000)
    } else {
      throw new Error('AI returned an empty response.')
    }
  } catch (e) {
    editorStatus.textContent = '❌ Translation failed: ' + (e instanceof Error ? e.message : 'Unknown error')
    editorStatus.className = 'error'
  } finally {
    translateEntryBtn.disabled = false
    translateEntryBtn.textContent = originalText
  }
})

clearBtn.addEventListener('click', clearForm)

// Initialize
checkUser()
