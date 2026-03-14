import './index.css';

let currentUser = null;
let treatments = [];
let clients = [];

// ── Invoice estado helpers ─────────────────────────────────────────────────

const ESTADO_BADGE_CLASS = {
  Borrador: 'badge-borrador',
  Emitida:  'badge-emitida',
  Pagada:   'badge-pagada',
  Anulada:  'badge-anulada',
};

function estadoBadge(estado) {
  const cls = ESTADO_BADGE_CLASS[estado] || 'badge-borrador';
  return `<span class="${cls}">${estado || 'Borrador'}</span>`;
}

// ── History helpers ────────────────────────────────────────────────────────

const NOTE_TEMPLATES = [
  { label: '-- Insertar plantilla --', value: '' },
  { label: 'Revisión periódica', value: 'Revisión periódica. Sin incidencias relevantes. Se mantiene tratamiento habitual.' },
  { label: 'Uña incarnada', value: 'Tratamiento de uña incarnada. Resección lateral de lámina ungueal. Buen resultado. Se pautan curas y antibiótico profiláctico.' },
  { label: 'Heloma dorsal', value: 'Heloma dorsal. Tratamiento mediante fresado y enucleación del núcleo. Se aplica parche protector. Próxima revisión en 4 semanas.' },
  { label: 'Onicogrifosis', value: 'Onicogrifosis. Fresado y recorte de uñas engrosadas. Se aconseja calzado adecuado y crema hidratante diaria.' },
  { label: 'Plantillas biomecánicas', value: 'Valoración biomecánica. Se toman moldes para plantillas ortopédicas personalizadas. Se aconseja calzado con buen soporte de arco.' },
  { label: 'Verruga plantar', value: 'Verruga plantar. Se aplica crioterapia. Se pautan curas domiciliarias. Próxima sesión en 3 semanas.' },
  { label: 'Pie diabético - revisión', value: 'Revisión de pie diabético. Exploración vascular y neurológica. Sin lesiones activas. Se realiza podología preventiva (quiropodia y fresado de uñas).' },
];

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fileIcon(mimeType) {
  if (mimeType && mimeType.startsWith('image/')) return '🖼';
  if (mimeType === 'application/pdf') return '📄';
  return '📎';
}

function templateSelectHtml(uid) {
  return `<select id="template-select-${uid}" class="form-control" style="margin-bottom:8px;">
    ${NOTE_TEMPLATES.map(t => `<option value="${escapeHtml(t.value)}">${escapeHtml(t.label)}</option>`).join('')}
  </select>`;
}

// ── Toast notifications ────────────────────────────────────────────────────

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  toast.innerHTML = `<span>${icons[type] || '✓'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  const duration = type === 'error' ? 6000 : 4000;
  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Confirm modal ─────────────────────────────────────────────────────────

function showConfirmModal(message, onConfirm) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <h3>⚠️ Confirmar acción</h3>
        <p>${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" id="confirm-cancel-btn">Cancelar</button>
          <button class="btn btn-danger" id="confirm-ok-btn">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#confirm-cancel-btn').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    overlay.querySelector('#confirm-ok-btn').addEventListener('click', async () => {
      overlay.remove();
      resolve(true);
      if (onConfirm) await onConfirm();
    });
  });
}

// ── Loading bar ───────────────────────────────────────────────────────────

function showLoading() {
  let bar = document.getElementById('loading-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'loading-bar';
    bar.className = 'loading-bar';
    document.body.appendChild(bar);
  }
}

function hideLoading() {
  const bar = document.getElementById('loading-bar');
  if (bar) bar.remove();
}

// ── Dark mode ─────────────────────────────────────────────────────────────

function initDarkMode() {
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = stored ? stored === 'dark' : prefersDark;
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    updateDarkModeBtn(true);
  }
}

function updateDarkModeBtn(isDark) {
  const icon = document.getElementById('dark-mode-icon');
  const label = document.getElementById('dark-mode-label');
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  if (label) label.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
}

function setupDarkMode() {
  const btn = document.getElementById('dark-mode-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
      updateDarkModeBtn(false);
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
      updateDarkModeBtn(true);
    }
  });
}

// ── Sidebar collapse ──────────────────────────────────────────────────────

function setupSidebarToggle() {
  const sidebar = document.getElementById('main-sidebar');
  const btn = document.getElementById('sidebar-toggle-btn');
  if (!sidebar || !btn) return;

  const collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  if (collapsed) {
    sidebar.classList.add('collapsed');
    btn.textContent = '▶';
  }

  btn.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    btn.textContent = isCollapsed ? '▶' : '◀';
    localStorage.setItem('sidebar-collapsed', isCollapsed);
  });
}

// ── Nav record counts ─────────────────────────────────────────────────────

function updateNavCounts() {
  const servicesCount = document.getElementById('nav-count-services');
  const clientsCount = document.getElementById('nav-count-clients');
  const invoicesCount = document.getElementById('nav-count-invoices');
  if (servicesCount) servicesCount.textContent = treatments.length || '';
  if (clientsCount) clientsCount.textContent = clients.length || '';
}

// ── Column sorting state ──────────────────────────────────────────────────

let treatmentsSortField = null;
let treatmentsSortDir = 'asc';
let clientsSortField = null;
let clientsSortDir = 'asc';
let invoicesSortField = null;
let invoicesSortDir = 'asc';
let currentInvoiceList = [];

function sortArray(arr, field, dir) {
  return [...arr].sort((a, b) => {
    let va = a[field];
    let vb = b[field];
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function setupSortableHeaders() {
  // Treatments table
  document.querySelectorAll('#page-services .th-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (treatmentsSortField === field) {
        treatmentsSortDir = treatmentsSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        treatmentsSortField = field;
        treatmentsSortDir = 'asc';
      }
      document.querySelectorAll('#page-services .th-sortable').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(treatmentsSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      const search = document.getElementById('treatment-search')?.value?.toLowerCase() || '';
      let filtered = treatments.filter(t =>
        t.nombre.toLowerCase().includes(search) ||
        (t.descripcion && t.descripcion.toLowerCase().includes(search))
      );
      filtered = sortArray(filtered, treatmentsSortField, treatmentsSortDir);
      renderTreatments(filtered);
    });
  });

  // Clients table
  document.querySelectorAll('#page-clients .th-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (clientsSortField === field) {
        clientsSortDir = clientsSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        clientsSortField = field;
        clientsSortDir = 'asc';
      }
      document.querySelectorAll('#page-clients .th-sortable').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(clientsSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      clientsPage = 1;
      searchClients();
    });
  });

  // Invoices table
  document.querySelectorAll('#tab-invoices .th-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (invoicesSortField === field) {
        invoicesSortDir = invoicesSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        invoicesSortField = field;
        invoicesSortDir = 'asc';
      }
      document.querySelectorAll('#tab-invoices .th-sortable').forEach(h => {
        h.classList.remove('sort-asc', 'sort-desc');
      });
      th.classList.add(invoicesSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      if (currentInvoiceList.length > 0) {
        renderInvoices(sortArray(currentInvoiceList, invoicesSortField, invoicesSortDir));
      }
    });
  });
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      const modalContainer = document.getElementById('modal-container');
      if (modalContainer && !modalContainer.classList.contains('hidden')) {
        closeModal();
        return;
      }
      const confirmOverlay = document.querySelector('.confirm-overlay');
      if (confirmOverlay) {
        confirmOverlay.querySelector('#confirm-cancel-btn')?.click();
        return;
      }
    }

    if (ctrl && e.key === 'n') {
      e.preventDefault();
      const activePage = document.querySelector('.page.active');
      if (!activePage) return;
      const pageId = activePage.id;
      if (pageId === 'page-services') document.getElementById('add-treatment-btn')?.click();
      else if (pageId === 'page-clients') document.getElementById('add-client-btn')?.click();
      else if (pageId === 'page-accounting') document.getElementById('add-invoice-btn')?.click();
    }

    if (ctrl && e.key === 'f') {
      e.preventDefault();
      const activePage = document.querySelector('.page.active');
      if (!activePage) return;
      const pageId = activePage.id;
      if (pageId === 'page-services') document.getElementById('treatment-search')?.focus();
      else if (pageId === 'page-clients') document.getElementById('client-search')?.focus();
      else if (pageId === 'page-accounting') document.getElementById('invoice-search')?.focus();
      else if (pageId === 'page-history') document.getElementById('history-search')?.focus();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  initApp();
});

function initApp() {
  setupLoginForm();
  setupNavigation();
  setupModal();
  setupTableActions();
  setupSessionTimeout();
  setupDarkMode();
  setupSidebarToggle();
  setupSortableHeaders();
  setupKeyboardShortcuts();
}

// ── Session timeout ────────────────────────────────────────────────────────

function setupSessionTimeout() {
  let lastActivitySent = 0;
  const THROTTLE_MS = 30000;

  function reportActivity() {
    const now = Date.now();
    if (now - lastActivitySent > THROTTLE_MS) {
      lastActivitySent = now;
      window.api.session.resetTimer();
    }
  }

  ['mousemove', 'keydown', 'click', 'scroll'].forEach(evt => {
    document.addEventListener(evt, reportActivity, { passive: true });
  });

  window.api.auth.onForceLogout(() => {
    currentUser = null;
    showLoginPage();
    const errorDiv = document.getElementById('login-error');
    errorDiv.textContent = 'Sesión cerrada por inactividad';
    errorDiv.classList.remove('hidden');
  });
}

function setupLoginForm() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');

    const result = await window.api.auth.login(username, password);

    if (result.success) {
      currentUser = result.user;
      errorDiv.classList.add('hidden');
      showMainApp();
      await loadAllData();
      window.api.clinicHistory.migrateEncryption().then(r => {
        if (r.migrated > 0) {
          console.log(`Migrated ${r.migrated} plaintext records to encrypted storage`);
        }
      });
    } else {
      errorDiv.textContent = result.error;
      errorDiv.classList.remove('hidden');
    }
  });
}

function showMainApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
}

function showLoginPage() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item:not(.logout)');
  const pages = document.querySelectorAll('.page');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      pages.forEach(p => {
        p.classList.remove('active');
        p.classList.add('hidden');
      });
      document.getElementById(`page-${page}`).classList.add('active');
      document.getElementById(`page-${page}`).classList.remove('hidden');
    });
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await window.api.auth.logout();
    currentUser = null;
    showLoginPage();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
      document.getElementById(`tab-${tab}`).classList.remove('hidden');
    });
  });
}

async function loadAllData() {
  showLoading();
  try {
    await loadTreatments();
    await loadClients();
    await loadInvoices();
    populateClientSelect();
    setupVATYearSelect();
    setupInvoiceSearch();
    setupInvoiceFilterEstado();
    setupChartYearSelect();
    setupClientFilters();
    setupHistorySearch();
    updateNavCounts();
  } finally {
    hideLoading();
  }
}

function setupClientFilters() {
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const resetAndSearch = () => { clientsPage = 1; searchClients(); };
  const debouncedSearch = debounce(resetAndSearch, 250);

  document.getElementById('client-search')?.addEventListener('input', debouncedSearch);
  document.getElementById('client-filter-activo')?.addEventListener('change', resetAndSearch);
  document.getElementById('client-filter-fecha-desde')?.addEventListener('change', resetAndSearch);
  document.getElementById('client-filter-fecha-hasta')?.addEventListener('change', resetAndSearch);

  document.getElementById('toggle-client-filters-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('client-advanced-filters');
    const btn   = document.getElementById('toggle-client-filters-btn');
    if (panel.classList.toggle('hidden')) {
      btn.textContent = 'Filtros ▾';
    } else {
      btn.style.display = '';
      btn.textContent = 'Filtros ▴';
    }
  });

  document.getElementById('clients-prev-btn')?.addEventListener('click', () => {
    if (clientsPage > 1) { clientsPage--; searchClients(); }
  });

  document.getElementById('clients-next-btn')?.addEventListener('click', () => {
    if (clientsPage < clientsTotalPages) { clientsPage++; searchClients(); }
  });

  document.getElementById('export-clients-csv-btn')?.addEventListener('click', async () => {
    const filters = getClientFilters();
    const r = await window.api.clients.exportCsv(filters);
    if (r.success) showToast('CSV guardado en Descargas: ' + r.filePath, 'success');
    else showToast('Error exportando CSV: ' + r.error, 'error');
  });

  document.getElementById('clients-clear-search-btn')?.addEventListener('click', () => {
    document.getElementById('client-search').value = '';
    clientsPage = 1;
    searchClients();
  });
}

function setupInvoiceSearch() {
  const searchInput = document.getElementById('invoice-search');
  if (searchInput) {
    searchInput.addEventListener('input', applyInvoiceFilters);
  }
  document.getElementById('invoices-clear-search-btn')?.addEventListener('click', () => {
    const inp = document.getElementById('invoice-search');
    if (inp) inp.value = '';
    applyInvoiceFilters();
  });
}

function setupInvoiceFilterEstado() {
  const sel = document.getElementById('invoice-filter-estado');
  if (sel) sel.addEventListener('change', applyInvoiceFilters);
}

function applyInvoiceFilters() {
  const search = (document.getElementById('invoice-search')?.value || '').toLowerCase();
  const estado = document.getElementById('invoice-filter-estado')?.value || '';
  window.api.invoices.getAll().then(result => {
    if (!result.success) return;
    let filtered = result.data;
    if (estado) filtered = filtered.filter(i => i.estado === estado);
    if (search) filtered = filtered.filter(i =>
      i.numero_factura.toLowerCase().includes(search) ||
      (i.cliente_nombre && i.cliente_nombre.toLowerCase().includes(search)) ||
      (i.cliente_apellidos && i.cliente_apellidos.toLowerCase().includes(search))
    );
    renderInvoices(filtered);
  });
}

async function loadTreatments() {
  const result = await window.api.treatments.getAll();
  if (result.success) {
    treatments = result.data;
    renderTreatments(treatments);
    updateNavCounts();
  }
}

// ── Client pagination state ────────────────────────────────────────────────
let clientsPage = 1;
const CLIENTS_PAGE_SIZE = 20;
let clientsTotal = 0;
let clientsTotalPages = 1;

async function loadClients() {
  // Load all active clients into the global array for autocomplete (invoices, history)
  const allResult = await window.api.clients.getAll();
  if (allResult.success) clients = allResult.data;
  // Load the table view using search (supports filters + pagination)
  await searchClients();
  updateNavCounts();
}

async function searchClients() {
  const filters = getClientFilters();
  const result = await window.api.clients.search({ ...filters, page: clientsPage, pageSize: CLIENTS_PAGE_SIZE });
  if (result.success) {
    clientsTotal = result.total;
    clientsTotalPages = result.totalPages;
    renderClients(result.data, result.total, result.page, result.totalPages);
  }
}

function getClientFilters() {
  return {
    q: document.getElementById('client-search')?.value || '',
    activo: document.getElementById('client-filter-activo')?.value ?? '1',
    fechaDesde: document.getElementById('client-filter-fecha-desde')?.value || '',
    fechaHasta: document.getElementById('client-filter-fecha-hasta')?.value || '',
  };
}

function setupTableActions() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action][data-id]');
    if (!btn) return;
    
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id);
    
    if (btn.closest('#treatments-table-body')) {
      if (action === 'edit') editTreatment(id);
      else if (action === 'delete') deleteTreatment(id);
    } else if (btn.closest('#clients-table-body')) {
      if (action === 'view-history') viewClientHistory(id);
      else if (action === 'add-treatment') addTreatmentToClient(id);
      else if (action === 'edit') editClient(id);
      else if (action === 'audit') viewClientAuditLog(id);
      else if (action === 'delete') deleteClient(id);
    } else if (btn.closest('#history-clients-body')) {
      if (action === 'view-history') viewClientHistory(id);
    } else if (btn.closest('#invoices-table-body')) {
      if (action === 'edit') editInvoice(id);
      else if (action === 'delete') annulInvoice(id);
      else if (action === 'pdf') generateInvoicePdf(id);
      else if (action === 'rectificar') createRectificativa(id);
    } else if (btn.closest('#history-timeline')) {
      if (action === 'edit') editHistoryEntry(id);
      else if (action === 'delete') deleteHistoryEntry(id);
      else if (action === 'add-file') addFileToHistory(id);
      else if (action === 'view-file') viewFileInModal(id);
    }
  });
}

async function loadInvoices() {
  const result = await window.api.invoices.getAll();
  if (result.success) {
    renderInvoices(result.data);
  }
}

function renderTreatments(list) {
  const tbody = document.getElementById('treatments-table-body');
  const empty = document.getElementById('treatments-empty');
  const emptyMsg = document.getElementById('treatments-empty-msg');
  const clearBtn = document.getElementById('treatments-clear-search-btn');
  const searchVal = document.getElementById('treatment-search')?.value || '';

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    if (searchVal && emptyMsg) {
      emptyMsg.textContent = `No se encontraron servicios para «${searchVal}»`;
      if (clearBtn) clearBtn.classList.remove('hidden');
    } else {
      if (emptyMsg) emptyMsg.textContent = 'No hay servicios registrados';
      if (clearBtn) clearBtn.classList.add('hidden');
    }
    return;
  }

  empty.classList.add('hidden');
  tbody.innerHTML = '';
  list.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.nombre}</td>
      <td>${t.descripcion || '-'}</td>
      <td>${t.precio.toFixed(2)} €</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${t.id}">Editar</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${t.id}">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderClients(list, total, page, totalPages) {
  const tbody = document.getElementById('clients-table-body');
  const empty = document.getElementById('clients-empty');
  const pagination = document.getElementById('clients-pagination');

  // Update pagination info
  const pageInfo = document.getElementById('clients-pagination-info');
  if (pageInfo) {
    pageInfo.textContent = total > 0
      ? `Página ${page} de ${totalPages} (${total} pacientes)`
      : '';
  }
  const prevBtn = document.getElementById('clients-prev-btn');
  const nextBtn = document.getElementById('clients-next-btn');
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    if (pagination) pagination.classList.add('hidden');
    const searchVal = document.getElementById('client-search')?.value || '';
    const emptyMsg = document.getElementById('clients-empty-msg');
    const clearBtn = document.getElementById('clients-clear-search-btn');
    if (searchVal && emptyMsg) {
      emptyMsg.textContent = `No se encontraron pacientes para «${searchVal}»`;
      if (clearBtn) clearBtn.classList.remove('hidden');
    } else {
      if (emptyMsg) emptyMsg.textContent = 'No hay pacientes registrados';
      if (clearBtn) clearBtn.classList.add('hidden');
    }
    return;
  }

  empty.classList.add('hidden');
  if (pagination) pagination.classList.remove('hidden');
  tbody.innerHTML = '';
  list.forEach(c => {
    const activoBadge = c.activo
      ? '<span class="badge-pagada">Activo</span>'
      : '<span class="badge-anulada">Inactivo</span>';
    const fechaAlta = c.fecha_alta
      ? new Date(c.fecha_alta).toLocaleDateString('es-ES')
      : '-';
    const tr = document.createElement('tr');
    if (!c.activo) tr.style.opacity = '0.6';
    tr.innerHTML = `
      <td><strong>${c.codigo}</strong></td>
      <td>${c.nombre} ${c.apellidos || ''}</td>
      <td>${c.dni || '-'}</td>
      <td>${c.telefono || '-'}</td>
      <td>${fechaAlta}</td>
      <td>${activoBadge}</td>
      <td class="actions">
        <button class="btn btn-primary btn-sm" data-action="view-history" data-id="${c.id}">Historia</button>
        <button class="btn btn-success btn-sm" data-action="add-treatment" data-id="${c.id}">+ Tratamiento</button>
        <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${c.id}">Editar</button>
        <button class="btn btn-secondary btn-sm" data-action="audit" data-id="${c.id}">Cambios</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${c.id}">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderInvoices(list) {
  currentInvoiceList = list;
  if (invoicesSortField) {
    list = sortArray(list, invoicesSortField, invoicesSortDir);
  }
  const tbody = document.getElementById('invoices-table-body');
  const empty = document.getElementById('invoices-empty');
  const banner = document.getElementById('payment-reminder-banner');
  const bannerText = document.getElementById('reminder-banner-text');

  // Payment overdue reminder (emitida > 30 days)
  const overdue = list.filter(i => i.estado === 'Emitida' && (i.dias_sin_pagar || 0) > 30);
  if (overdue.length > 0) {
    bannerText.textContent = `${overdue.length} factura(s) sin cobrar con más de 30 días: ${overdue.map(i => i.numero_factura).join(', ')}`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    const searchVal = document.getElementById('invoice-search')?.value || '';
    const emptyMsg = document.getElementById('invoices-empty-msg');
    const clearBtn = document.getElementById('invoices-clear-search-btn');
    if (searchVal && emptyMsg) {
      emptyMsg.textContent = `No se encontraron facturas para «${searchVal}»`;
      if (clearBtn) clearBtn.classList.remove('hidden');
    } else {
      if (emptyMsg) emptyMsg.textContent = 'No hay facturas registradas';
      if (clearBtn) clearBtn.classList.add('hidden');
    }
    return;
  }

  empty.classList.add('hidden');
  tbody.innerHTML = '';
  list.forEach(i => {
    const tr = document.createElement('tr');
    if (i.estado === 'Anulada') tr.style.opacity = '0.55';
    const isRect = i.numero_factura && i.numero_factura.startsWith('R');
    tr.innerHTML = `
      <td>${i.numero_factura}${isRect ? ' <small style="color:#f59e0b;font-weight:700">(R)</small>' : ''}</td>
      <td>${i.cliente_nombre} ${i.cliente_apellidos || ''}</td>
      <td>${new Date(i.fecha).toLocaleDateString('es-ES')}</td>
      <td>${i.total.toFixed(2)} €</td>
      <td>${i.iva.toFixed(2)} €</td>
      <td>${estadoBadge(i.estado)}</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${i.id}">Editar</button>
        <button class="btn btn-primary btn-sm" data-action="pdf" data-id="${i.id}">PDF</button>
        ${i.estado !== 'Anulada' ? `<button class="btn btn-secondary btn-sm" data-action="rectificar" data-id="${i.id}">Abonar</button>` : ''}
        ${i.estado !== 'Anulada' ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${i.id}">Anular</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function populateClientSelect() {
  const searchInput = document.getElementById('history-search');
  const resultsContainer = document.getElementById('history-results');
  const tbody = document.getElementById('history-clients-body');
  const emptyState = document.getElementById('history-clients-empty');
  
  function renderClientList(filteredClients = clients) {
    if (filteredClients.length === 0) {
      tbody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }
    
    emptyState.classList.add('hidden');
    tbody.innerHTML = '';
    filteredClients.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.codigo}</strong></td>
        <td>${c.nombre} ${c.apellidos || ''}</td>
        <td>${c.telefono || '-'}</td>
        <td class="actions">
          <button class="btn btn-primary btn-sm" data-action="view-history" data-id="${c.id}">Ver Historia</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  renderClientList();
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const search = e.target.value.toLowerCase();
      if (search.length === 0) {
        renderClientList(clients);
      } else {
        const filtered = clients.filter(c => 
          c.codigo.toLowerCase().includes(search) ||
          c.nombre.toLowerCase().includes(search) ||
          (c.apellidos && c.apellidos.toLowerCase().includes(search)) ||
          (c.dni && c.dni.toLowerCase().includes(search)) ||
          (c.telefono && c.telefono.includes(search))
        );
        renderClientList(filtered);
      }
    });
  }
}

let currentHistoryClientId = null;

async function loadClientHistory(clienteId) {
  currentHistoryClientId = clienteId;

  const client = clients.find(c => c.id === clienteId);
  const nameEl = document.getElementById('history-patient-name');
  if (nameEl && client) {
    nameEl.textContent = `${client.codigo} — ${client.nombre} ${client.apellidos || ''}`;
  }

  const [histResult, filesResult] = await Promise.all([
    window.api.clinicHistory.getByClient(clienteId),
    window.api.clinicHistory.getFilesByClient(clienteId),
  ]);

  const timeline = document.getElementById('history-timeline');
  const empty    = document.getElementById('history-empty');

  if (!histResult.success) {
    timeline.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  const filesByEntry = {};
  if (filesResult.success) {
    for (const f of filesResult.data) {
      if (!filesByEntry[f.historia_id]) filesByEntry[f.historia_id] = [];
      filesByEntry[f.historia_id].push(f);
    }
  }

  const entries = histResult.data;

  if (entries.length === 0) {
    timeline.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  timeline.innerHTML = '';
  timeline.className = 'timeline';

  entries.forEach(h => {
    const date    = new Date(h.fecha);
    const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    const yearStr = date.getFullYear();
    const entryFiles = filesByEntry[h.id] || [];

    const filesHtml = entryFiles.length > 0
      ? `<div class="timeline-card-files">
          ${entryFiles.map(f => `
            <button class="file-chip" data-action="view-file" data-id="${f.id}">
              ${fileIcon(f.mime_type)} ${escapeHtml(f.nombre)}
            </button>
          `).join('')}
        </div>`
      : '';

    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div class="timeline-date">${dateStr}<br>${yearStr}</div>
      <div class="timeline-dot"></div>
      <div class="timeline-card">
        <div class="timeline-card-header">
          <span class="timeline-card-title">${escapeHtml(h.tratamiento_nombre || 'Consulta general')}</span>
          <div style="display:flex; gap:5px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" data-action="add-file" data-id="${h.id}">📎 Adjuntar</button>
            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${h.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-action="delete" data-id="${h.id}">Eliminar</button>
          </div>
        </div>
        <div class="timeline-card-body">${escapeHtml(h.notas || '')}</div>
        ${filesHtml}
      </div>
    `;
    timeline.appendChild(item);
  });
}

function setupVATYearSelect() {
  const select = document.getElementById('vat-year');
  const currentYear = new Date().getFullYear();
  select.innerHTML = '';
  for (let y = currentYear; y >= currentYear - 5; y--) {
    select.innerHTML += `<option value="${y}">${y}</option>`;
  }
}

function setupModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-container').addEventListener('click', (e) => {
    if (e.target.id === 'modal-container') {
      closeModal();
    }
    if (e.target.classList.contains('modal-cancel-btn')) {
      closeModal();
    }
  });
}

function openModal(title, bodyContent, footerContent) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyContent;
  
  const modalFooter = document.querySelector('.modal-footer');
  if (footerContent) {
    modalFooter.innerHTML = footerContent;
  } else {
    modalFooter.innerHTML = `
      <button class="btn btn-secondary modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary" id="modal-save-btn">Guardar</button>
    `;
  }
  
  document.getElementById('modal-container').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-container').classList.add('hidden');
}

window.closeModal = closeModal;

document.getElementById('add-treatment-btn').addEventListener('click', () => openTreatmentModal());
document.getElementById('add-treatment-btn-empty').addEventListener('click', () => openTreatmentModal());

document.getElementById('add-client-btn').addEventListener('click', () => openClientModal());
document.getElementById('add-client-btn-empty').addEventListener('click', () => openClientModal());

document.getElementById('add-invoice-btn').addEventListener('click', () => openInvoiceModal());

document.getElementById('add-history-btn').addEventListener('click', () => openHistoryModal());

document.getElementById('generate-report-btn').addEventListener('click', generateReport);
document.getElementById('generate-vat-btn').addEventListener('click', generateVATReport);

document.getElementById('treatment-search').addEventListener('input', (e) => {
  const search = e.target.value.toLowerCase();
  let filtered = treatments.filter(t =>
    t.nombre.toLowerCase().includes(search) ||
    (t.descripcion && t.descripcion.toLowerCase().includes(search))
  );
  if (treatmentsSortField) {
    filtered = sortArray(filtered, treatmentsSortField, treatmentsSortDir);
  }
  renderTreatments(filtered);
});

document.getElementById('treatments-clear-search-btn')?.addEventListener('click', () => {
  document.getElementById('treatment-search').value = '';
  renderTreatments(treatments);
});


function openTreatmentModal(treatment = null) {
  const isEdit = !!treatment;
  const body = `
    <form id="treatment-form">
      <div class="form-group">
        <label for="treatment-nombre">Nombre *</label>
        <input type="text" id="treatment-nombre" class="form-control" required value="${treatment?.nombre || ''}">
      </div>
      <div class="form-group">
        <label for="treatment-descripcion">Descripción</label>
        <textarea id="treatment-descripcion" class="form-control" rows="3">${treatment?.descripcion || ''}</textarea>
      </div>
      <div class="form-group">
        <label for="treatment-precio">Precio (€) *</label>
        <input type="number" id="treatment-precio" class="form-control" step="0.01" required value="${treatment?.precio || ''}">
      </div>
    </form>
  `;
  
  const footer = `
    <button class="btn btn-secondary modal-cancel-btn">Cancelar</button>
    <button class="btn btn-primary" id="treatment-save-btn">${isEdit ? 'Actualizar' : 'Crear'}</button>
  `;
  
  openModal(isEdit ? 'Editar Servicio' : 'Nuevo Servicio', body, footer);
  
  document.getElementById('treatment-save-btn').addEventListener('click', async () => {
    const form = document.getElementById('treatment-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    
    const data = {
      nombre: document.getElementById('treatment-nombre').value,
      descripcion: document.getElementById('treatment-descripcion').value,
      precio: parseFloat(document.getElementById('treatment-precio').value)
    };
    
    let result;
    if (isEdit) {
      result = await window.api.treatments.update(treatment.id, data);
    } else {
      result = await window.api.treatments.create(data);
    }
    
    if (result.success) {
      closeModal();
      await loadTreatments();
      showToast('✓ Guardado correctamente', 'success');
    } else {
      showToast('Error: ' + result.error, 'error');
    }
  });
}

window.editTreatment = (id) => {
  const treatmentId = parseInt(id);
  const treatment = treatments.find(t => t.id === treatmentId);
  if (treatment) openTreatmentModal(treatment);
};

window.deleteTreatment = async (id) => {
  showConfirmModal('¿Está seguro de que desea eliminar este servicio?', async () => {
    const result = await window.api.treatments.delete(id);
    if (result.success) {
      await loadTreatments();
    }
  });
};

function openClientModal(client = null) {
  const isEdit = !!client;
  const body = `
    <form id="client-form">
      <div class="form-row">
        <div class="form-group">
          <label for="client-nombre">Nombre *</label>
          <input type="text" id="client-nombre" class="form-control" required value="${client?.nombre || ''}">
        </div>
        <div class="form-group">
          <label for="client-apellidos">Apellidos</label>
          <input type="text" id="client-apellidos" class="form-control" value="${client?.apellidos || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="client-dni">DNI</label>
          <input type="text" id="client-dni" class="form-control" value="${client?.dni || ''}">
        </div>
        <div class="form-group">
          <label for="client-telefono">Teléfono</label>
          <input type="tel" id="client-telefono" class="form-control" value="${client?.telefono || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="client-fecha-nacimiento">Fecha de Nacimiento</label>
          <input type="date" id="client-fecha-nacimiento" class="form-control" value="${client?.fecha_nacimiento || ''}">
        </div>
        <div class="form-group">
          <label for="client-num-ss">Nº Seguridad Social</label>
          <input type="text" id="client-num-ss" class="form-control" value="${client?.num_seguridad_social || ''}">
        </div>
      </div>
      <div class="form-group">
        <label for="client-email">Email</label>
        <input type="email" id="client-email" class="form-control" value="${client?.email || ''}">
      </div>
      <div class="form-group">
        <label for="client-direccion">Dirección</label>
        <textarea id="client-direccion" class="form-control" rows="2">${client?.direccion || ''}</textarea>
      </div>
      <div class="form-group">
        <label for="client-observaciones">Observaciones</label>
        <textarea id="client-observaciones" class="form-control" rows="3">${client?.observaciones || ''}</textarea>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary modal-cancel-btn">Cancelar</button>
    <button class="btn btn-primary" id="client-save-btn">${isEdit ? 'Actualizar' : 'Crear'}</button>
  `;

  openModal(isEdit ? 'Editar Paciente' : 'Nuevo Paciente', body, footer);

  document.getElementById('client-save-btn').addEventListener('click', async () => {
    const form = document.getElementById('client-form');
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = {
      nombre: document.getElementById('client-nombre').value,
      apellidos: document.getElementById('client-apellidos').value,
      dni: document.getElementById('client-dni').value,
      telefono: document.getElementById('client-telefono').value,
      email: document.getElementById('client-email').value,
      direccion: document.getElementById('client-direccion').value,
      fecha_nacimiento: document.getElementById('client-fecha-nacimiento').value || null,
      num_seguridad_social: document.getElementById('client-num-ss').value || null,
      observaciones: document.getElementById('client-observaciones').value || null,
    };

    let result;
    if (isEdit) {
      result = await window.api.clients.update(client.id, data);
    } else {
      result = await window.api.clients.create(data);
    }

    if (result.success) {
      closeModal();
      await loadClients();
      populateClientSelect();
      showToast('✓ Guardado correctamente', 'success');
    } else {
      showToast('Error: ' + result.error, 'error');
    }
  });
}

window.editClient = (id) => {
  const clientId = parseInt(id);
  const client = clients.find(c => c.id === clientId);
  if (client) openClientModal(client);
};

window.deleteClient = async (id) => {
  const clientId = parseInt(id);
  showConfirmModal('¿Está seguro de que desea eliminar este paciente?', async () => {
    const result = await window.api.clients.delete(clientId);
    if (result.success) {
      await loadClients();
      populateClientSelect();
    }
  });
};

async function viewClientAuditLog(clientId) {
  const client = clients.find(c => c.id === clientId);
  const result = await window.api.clients.getAuditLog(clientId);
  if (!result.success) {
    showToast('Error al cargar historial de cambios: ' + result.error, 'error');
    return;
  }

  const rows = result.data;
  const clientName = client ? `${client.nombre} ${client.apellidos || ''}`.trim() : `#${clientId}`;

  const tableRows = rows.length === 0
    ? '<tr><td colspan="4" style="text-align:center;color:#9ca3af;">Sin cambios registrados</td></tr>'
    : rows.map(r => `
        <tr>
          <td>${new Date(r.fecha).toLocaleString('es-ES')}</td>
          <td><span class="badge-${r.accion === 'CREATE' ? 'pagada' : r.accion === 'DELETE' ? 'anulada' : 'emitida'}">${r.accion}</span></td>
          <td>${r.resumen || '-'}</td>
          <td>${r.usuario || '-'}</td>
        </tr>
      `).join('');

  const body = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Fecha</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Acción</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Resumen</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Usuario</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;

  openModal(`Historial de Cambios — ${clientName}`, body, `<button class="btn btn-secondary modal-cancel-btn">Cerrar</button>`);
}

function viewClientHistory(clientId) {
  const client = clients.find(c => c.id === clientId);
  if (!client) return;
  
  const historyNav = document.querySelector('[data-page="history"]');
  if (historyNav) {
    historyNav.click();
  }
  
  setTimeout(async () => {
    await loadClientHistory(clientId);
    document.getElementById('history-results').classList.add('hidden');
    document.getElementById('history-content').classList.remove('hidden');
    
    const backBtn = document.getElementById('history-back-btn');
    if (!backBtn) {
      const contentDiv = document.getElementById('history-content');
      const header = contentDiv.querySelector('.card-header');
      if (header) {
        const backButton = document.createElement('button');
        backButton.id = 'history-back-btn';
        backButton.className = 'btn btn-secondary btn-sm';
        backButton.textContent = '← Volver';
        backButton.onclick = () => {
          document.getElementById('history-content').classList.add('hidden');
          document.getElementById('history-results').classList.remove('hidden');
          document.getElementById('history-search').value = '';
        };
        header.insertBefore(backButton, header.firstChild);
      }
    }
  }, 100);
}

async function editHistoryEntry(historyId) {
  const result = await window.api.clinicHistory.getById(historyId);
  if (!result.success) {
    showToast('Error al cargar entrada: ' + result.error, 'error');
    return;
  }

  const history = result.data;

  const filesResult = await window.api.clinicHistory.getFilesByClient(history.cliente_id);
  const entryFiles = filesResult.success
    ? filesResult.data.filter(f => f.historia_id === historyId)
    : [];

  let treatmentOptions = '<option value="">-- Sin tratamiento específico --</option>';
  treatmentOptions += treatments.map(t =>
    `<option value="${t.id}" ${t.id === history.tratamiento_id ? 'selected' : ''}>${escapeHtml(t.nombre)}</option>`
  ).join('');

  const filesListHtml = entryFiles.length > 0
    ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
        ${entryFiles.map(f => `
          <span style="display:inline-flex; align-items:center; gap:4px; background:var(--gray-100); border:1px solid var(--gray-200); border-radius:20px; padding:3px 8px; font-size:12px;">
            ${fileIcon(f.mime_type)} ${escapeHtml(f.nombre)}
            <button type="button" style="background:none; border:none; cursor:pointer; color:var(--danger-color); font-size:14px; padding:0 2px; line-height:1;" data-delete-file="${f.id}">×</button>
          </span>
        `).join('')}
      </div>`
    : '<p style="font-size:12px; color:var(--gray-400); margin-top:4px;">Sin archivos adjuntos</p>';

  const body = `
    <form id="history-edit-form">
      <div class="form-group">
        <label for="history-treatment">Tratamiento</label>
        <select id="history-treatment" class="form-control">${treatmentOptions}</select>
      </div>
      <div class="form-group">
        <label>Plantilla de nota</label>
        ${templateSelectHtml('edit')}
        <label for="history-notas">Notas Clínicas</label>
        <textarea id="history-notas" class="form-control" rows="6">${escapeHtml(history.notas || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Archivos adjuntos</label>
        <div id="files-list-container">${filesListHtml}</div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-file-edit-btn" style="margin-top:8px;">📎 Añadir archivo</button>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary modal-cancel-btn">Cancelar</button>
    <button class="btn btn-success" id="update-history-btn">Actualizar</button>
  `;

  openModal('Editar Entrada Clínica', body, footer);

  document.getElementById('template-select-edit')?.addEventListener('change', (e) => {
    if (e.target.value) {
      const notas = document.getElementById('history-notas');
      notas.value = (notas.value ? notas.value + '\n\n' : '') + e.target.value;
      e.target.value = '';
    }
  });

  document.querySelectorAll('[data-delete-file]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fileId = parseInt(btn.dataset.deleteFile);
      showConfirmModal('¿Eliminar este archivo adjunto?', async () => {
        await window.api.clinicHistory.deleteFile(fileId);
        btn.closest('span').remove();
      });
    });
  });

  document.getElementById('add-file-edit-btn')?.addEventListener('click', async () => {
    const r = await window.api.clinicHistory.addFile(historyId);
    if (r.success && r.added > 0) {
      closeModal();
      await loadClientHistory(currentHistoryClientId);
    }
  });

  document.getElementById('update-history-btn').addEventListener('click', async () => {
    const data = {
      tratamiento_id: document.getElementById('history-treatment').value
        ? parseInt(document.getElementById('history-treatment').value)
        : null,
      notas: document.getElementById('history-notas').value,
    };

    const updateResult = await window.api.clinicHistory.update(historyId, data);

    if (updateResult.success) {
      closeModal();
      if (currentHistoryClientId) {
        await loadClientHistory(currentHistoryClientId);
      }
      showToast('✓ Guardado correctamente', 'success');
    } else {
      showToast('Error: ' + updateResult.error, 'error');
    }
  });
}

async function deleteHistoryEntry(historyId) {
  showConfirmModal('¿Está seguro de que desea eliminar esta entrada?', async () => {
    const result = await window.api.clinicHistory.delete(historyId);
    if (result.success) {
      if (currentHistoryClientId) {
        await loadClientHistory(currentHistoryClientId);
      }
    } else {
      showToast('Error: ' + result.error, 'error');
    }
  });
}

async function addTreatmentToClient(clientId) {
  const client = clients.find(c => c.id === clientId);
  if (!client) return;
  
  if (treatments.length === 0) {
    showToast('Debe crear al menos un servicio antes de añadir un tratamiento', 'warning');
    return;
  }
  
  let treatmentOptions = '<option value="">-- Seleccionar --</option>';
  treatmentOptions += treatments.map(t => `<option value="${t.id}" data-price="${t.precio}">${t.nombre} - ${t.precio.toFixed(2)} €</option>`).join('');
  
  const body = `
    <form id="add-treatment-form">
      <div class="form-group">
        <label>Paciente</label>
        <input type="text" class="form-control" value="${client.codigo} - ${client.nombre} ${client.apellidos || ''}" readonly>
      </div>
      <div class="form-group">
        <label for="treatment-select">Tratamiento *</label>
        <select id="treatment-select" class="form-control" required>${treatmentOptions}</select>
      </div>
      <div class="form-group">
        <label for="treatment-notes">Notas</label>
        <textarea id="treatment-notes" class="form-control" rows="3" placeholder="Notas sobre el tratamiento..."></textarea>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" id="create-invoice" checked> Crear factura automáticamente
        </label>
      </div>
    </form>
  `;
  
  const footer = `
    <button class="btn btn-secondary modal-cancel-btn">Cancelar</button>
    <button class="btn btn-success" id="save-treatment-btn">Guardar</button>
  `;
  
  openModal('Añadir Tratamiento', body, footer);
  
  document.getElementById('save-treatment-btn').addEventListener('click', async () => {
    const treatmentId = document.getElementById('treatment-select').value;
    const notes = document.getElementById('treatment-notes').value;
    const createInvoice = document.getElementById('create-invoice').checked;
    
    if (!treatmentId) {
      showToast('Seleccione un tratamiento', 'warning');
      return;
    }
    
    const treatment = treatments.find(t => t.id === parseInt(treatmentId));
    const price = treatment.precio;
    const iva = price * 0.21;
    
    const historyResult = await window.api.clinicHistory.create({
      cliente_id: clientId,
      tratamiento_id: parseInt(treatmentId),
      notas: notes || `Tratamiento: ${treatment.nombre}`
    });
    
    if (!historyResult.success) {
      showToast('Error al guardar en historial: ' + historyResult.error, 'error');
      return;
    }
    
    if (createInvoice) {
      const numResult = await window.api.invoices.getNextNumber();
      const invoiceResult = await window.api.invoices.create({
        cliente_id: clientId,
        numero_factura: numResult.numero_factura,
        subtotal: price,
        iva: iva,
        total: price + iva,
        observaciones: notes || '',
        items: [{
          tratamiento_id: parseInt(treatmentId),
          cantidad: 1,
          precio: price,
          iva: iva
        }]
      });
      
      if (invoiceResult.success) {
        await loadInvoices();
        closeModal();
        showToast(`Tratamiento añadido y factura ${numResult.numero_factura} creada`, 'success');
      } else {
        showToast('Tratamiento guardado pero error al crear factura: ' + invoiceResult.error, 'error');
      }
    } else {
      closeModal();
      showToast('Tratamiento añadido al historial clínico', 'success');
    }
  });
}

async function editInvoice(invoiceId) {
  const result = await window.api.invoices.getById(invoiceId);
  if (!result.success) {
    showToast('Error al cargar factura: ' + result.error, 'error');
    return;
  }
  
  const invoice = result.data;
  
  let treatmentOptions = '<option value="">-- Seleccionar --</option>';
  treatmentOptions += treatments.map(t => `<option value="${t.id}" data-price="${t.precio}">${t.nombre} - ${t.precio.toFixed(2)} €</option>`).join('');
  
  const body = `
    <form id="invoice-edit-form">
      <div class="form-group">
        <label>Paciente *</label>
        <input type="text" id="edit-invoice-client-search" class="form-control" placeholder="Buscar paciente por código, nombre o DNI..." value="${invoice.cliente_id ? (clients.find(c => c.id === invoice.cliente_id)?.codigo + ' - ' + clients.find(c => c.id === invoice.cliente_id)?.nombre + ' ' + (clients.find(c => c.id === invoice.cliente_id)?.apellidos || '')) : ''}">
        <div id="edit-invoice-client-list" style="max-height: 200px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 4px; display: none;">
        </div>
        <div id="edit-invoice-selected-client" class="${invoice.cliente_id ? '' : 'hidden'}" style="padding: 12px; background: #e0f2fe; border-radius: 8px; margin-top: 8px;">
          <strong>Paciente seleccionado:</strong> <span id="edit-selected-client-name">${invoice.cliente_id ? (clients.find(c => c.id === invoice.cliente_id)?.codigo + ' - ' + clients.find(c => c.id === invoice.cliente_id)?.nombre + ' ' + (clients.find(c => c.id === invoice.cliente_id)?.apellidos || '')) : ''}</span>
          <button type="button" class="btn btn-danger btn-sm" id="edit-clear-client-btn" style="margin-left: 8px;">Cambiar</button>
        </div>
      </div>
      <input type="hidden" id="edit-invoice-client-id" value="${invoice.cliente_id || ''}">
      <div class="form-group">
        <label for="edit-invoice-number">Número de Factura</label>
        <input type="text" id="edit-invoice-number" class="form-control" value="${invoice.numero_factura}">
      </div>
      <div class="form-group">
        <label>Conceptos</label>
        <table id="edit-invoice-items-table">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Cantidad</th>
              <th>Precio</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="edit-invoice-items-body">
          </tbody>
        </table>
        <button type="button" class="btn btn-secondary btn-sm" id="add-edit-invoice-item-btn" style="margin-top: 8px;">+ Añadir Concepto</button>
      </div>
      <div class="form-group">
        <label for="edit-invoice-observaciones">Observaciones</label>
        <textarea id="edit-invoice-observaciones" class="form-control" rows="2">${invoice.observaciones || ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="edit-invoice-estado">Estado</label>
          <select id="edit-invoice-estado" class="form-control">
            <option value="Borrador" ${invoice.estado === 'Borrador' ? 'selected' : ''}>Borrador</option>
            <option value="Emitida"  ${invoice.estado === 'Emitida'  ? 'selected' : ''}>Emitida</option>
            <option value="Pagada"   ${invoice.estado === 'Pagada'   ? 'selected' : ''}>Pagada</option>
            <option value="Anulada"  ${invoice.estado === 'Anulada'  ? 'selected' : ''}>Anulada</option>
          </select>
        </div>
        <div class="form-group">
          <label for="edit-invoice-metodo-pago">Método de Pago</label>
          <select id="edit-invoice-metodo-pago" class="form-control">
            <option value="">-- Sin especificar --</option>
            <option value="efectivo"      ${invoice.metodo_pago === 'efectivo'      ? 'selected' : ''}>Efectivo</option>
            <option value="tarjeta"       ${invoice.metodo_pago === 'tarjeta'       ? 'selected' : ''}>Tarjeta</option>
            <option value="transferencia" ${invoice.metodo_pago === 'transferencia' ? 'selected' : ''}>Transferencia</option>
          </select>
        </div>
      </div>
      <div class="form-group" id="edit-invoice-fecha-pago-group"
           style="display:${invoice.estado === 'Pagada' ? 'block' : 'none'}">
        <label for="edit-invoice-fecha-pago">Fecha de Pago</label>
        <input type="date" id="edit-invoice-fecha-pago" class="form-control" value="${invoice.fecha_pago || ''}">
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary modal-cancel-btn">Cancelar</button>
    <button class="btn btn-success" id="update-invoice-btn">Actualizar</button>
  `;
  
  openModal('Editar Factura', body, footer);

  document.getElementById('edit-invoice-estado').addEventListener('change', (e) => {
    document.getElementById('edit-invoice-fecha-pago-group').style.display =
      e.target.value === 'Pagada' ? 'block' : 'none';
  });

  const editClientSearch = document.getElementById('edit-invoice-client-search');
  const editClientList = document.getElementById('edit-invoice-client-list');
  const editSelectedClientDiv = document.getElementById('edit-invoice-selected-client');
  const editSelectedClientName = document.getElementById('edit-selected-client-name');
  const editClientIdInput = document.getElementById('edit-invoice-client-id');
  
  function renderEditClientList(filteredClients) {
    if (filteredClients.length === 0) {
      editClientList.innerHTML = '<div style="padding: 12px; color: #6b7280;">No se encontraron pacientes</div>';
      return;
    }
    editClientList.innerHTML = filteredClients.map(c => `
      <div class="edit-client-list-item" data-id="${c.id}" data-name="${c.codigo} - ${c.nombre} ${c.apellidos || ''}" 
           style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6;">
        <strong>${c.codigo}</strong> - ${c.nombre} ${c.apellidos || ''} <br>
        <small style="color: #6b7280;">${c.dni || ''} ${c.telefono || ''}</small>
      </div>
    `).join('');
    
    editClientList.querySelectorAll('.edit-client-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const clientId = item.dataset.id;
        const clientName = item.dataset.name;
        editClientIdInput.value = clientId;
        editSelectedClientName.textContent = clientName;
        editClientList.style.display = 'none';
        editClientSearch.value = '';
        editSelectedClientDiv.classList.remove('hidden');
      });
    });
  }
  
  if (editClientSearch) {
    editClientSearch.addEventListener('input', (e) => {
      const search = e.target.value.toLowerCase();
      if (search.length === 0) {
        editClientList.style.display = 'none';
        return;
      }
      
      const filtered = clients.filter(c => 
        c.codigo.toLowerCase().includes(search) ||
        c.nombre.toLowerCase().includes(search) ||
        (c.apellidos && c.apellidos.toLowerCase().includes(search)) ||
        (c.dni && c.dni.toLowerCase().includes(search)) ||
        (c.telefono && c.telefono.includes(search))
      );
      
      editClientList.style.display = 'block';
      renderEditClientList(filtered);
    });
    
    editClientSearch.addEventListener('focus', () => {
      if (editClientSearch.value.length > 0) {
        editClientList.style.display = 'block';
        renderEditClientList(clients);
      }
    });
  }
  
  if (document.getElementById('edit-clear-client-btn')) {
    document.getElementById('edit-clear-client-btn').addEventListener('click', () => {
      editClientIdInput.value = '';
      editSelectedClientDiv.classList.add('hidden');
    });
  }
  
  const tbody = document.getElementById('edit-invoice-items-body');
  
  function addEditInvoiceItem(treatmentId = '', quantity = 1, price = 0) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <select class="form-control item-treatment" onchange="updateEditItemPrice(this)">
          <option value="">-- Seleccionar --</option>
          ${treatmentOptions}
        </select>
      </td>
      <td><input type="number" class="form-control item-quantity" value="${quantity}" min="1" style="width: 80px;"></td>
      <td><input type="number" class="form-control item-price" value="${price}" step="0.01" style="width: 100px;"></td>
      <td><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();">×</button></td>
    `;
    tbody.appendChild(row);
    if (treatmentId) {
      row.querySelector('.item-treatment').value = treatmentId;
    }
  }
  
  window.updateEditItemPrice = (select) => {
    const option = select.options[select.selectedIndex];
    const price = option.dataset.price || 0;
    select.closest('tr').querySelector('.item-price').value = price;
  };
  
  document.getElementById('add-edit-invoice-item-btn').addEventListener('click', () => addEditInvoiceItem());
  
  if (invoice.items && invoice.items.length > 0) {
    invoice.items.forEach(item => {
      addEditInvoiceItem(item.tratamiento_id, item.cantidad, item.precio);
    });
  } else {
    addEditInvoiceItem();
  }
  
  document.getElementById('update-invoice-btn').addEventListener('click', async () => {
    const clienteId = document.getElementById('edit-invoice-client-id').value;
    if (!clienteId) {
      showToast('Seleccione un paciente', 'warning');
      return;
    }
    
    const items = [];
    document.querySelectorAll('#edit-invoice-items-body tr').forEach(row => {
      const treatmentId = row.querySelector('.item-treatment').value;
      if (treatmentId) {
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        const quantity = parseInt(row.querySelector('.item-quantity').value) || 1;
        const iva = price * quantity * 0.21;
        items.push({
          tratamiento_id: parseInt(treatmentId),
          cantidad: quantity,
          precio: price,
          iva: iva
        });
      }
    });
    
    if (items.length === 0) {
      showToast('Añada al menos un concepto', 'warning');
      return;
    }
    
    const subtotal = items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    const iva = subtotal * 0.21;
    const total = subtotal + iva;
    
    const data = {
      cliente_id: parseInt(clienteId),
      numero_factura: document.getElementById('edit-invoice-number').value,
      subtotal: subtotal,
      iva: iva,
      total: total,
      observaciones: document.getElementById('edit-invoice-observaciones').value,
      estado: document.getElementById('edit-invoice-estado').value,
      metodo_pago: document.getElementById('edit-invoice-metodo-pago').value || null,
      fecha_pago: document.getElementById('edit-invoice-fecha-pago').value || null,
      items: items
    };

    const updateResult = await window.api.invoices.update(invoiceId, data);
    
    if (updateResult.success) {
      closeModal();
      await loadInvoices();
      showToast('✓ Factura actualizada', 'success');
    } else {
      showToast('Error: ' + updateResult.error, 'error');
    }
  });
}

async function annulInvoice(invoiceId) {
  showConfirmModal('¿Está seguro de que desea ANULAR esta factura? Quedará marcada como Anulada.', async () => {
    const result = await window.api.invoices.updateEstado(invoiceId, 'Anulada', null, null);
    if (result.success) {
      await loadInvoices();
    } else {
      showToast('Error: ' + result.error, 'error');
    }
  });
}

async function generateInvoicePdf(invoiceId) {
  const result = await window.api.invoices.generatePdf(invoiceId);
  if (result.success) {
    showToast('PDF guardado en Descargas: ' + result.filePath, 'success');
  } else {
    showToast('Error generando PDF: ' + result.error, 'error');
  }
}

async function createRectificativa(originalId) {
  showConfirmModal('¿Crear una factura rectificativa (abono) para esta factura?\nLa factura original quedará marcada como Anulada.', async () => {
    const result = await window.api.invoices.createRectificativa(originalId);
    if (result.success) {
      showToast('Factura rectificativa creada: ' + result.numero_factura, 'success');
      await loadInvoices();
    } else {
      showToast('Error: ' + result.error, 'error');
    }
  });
}

async function addFileToHistory(historiaId) {
  const r = await window.api.clinicHistory.addFile(historiaId);
  if (r.success && r.added > 0) {
    await loadClientHistory(currentHistoryClientId);
  } else if (!r.success) {
    showToast('Error al adjuntar archivo: ' + r.error, 'error');
  }
}

async function viewFileInModal(fileId) {
  const r = await window.api.clinicHistory.getFileData(fileId);
  if (!r.success) {
    showToast('Error al cargar archivo: ' + r.error, 'error');
    return;
  }

  const { dataUrl, nombre, mime_type } = r;
  let content;
  if (mime_type && mime_type.startsWith('image/')) {
    content = `<img src="${dataUrl}" style="max-width:100%; max-height:65vh; display:block; margin:0 auto; border-radius:4px;" alt="${escapeHtml(nombre)}">`;
  } else if (mime_type === 'application/pdf') {
    content = `<iframe src="${dataUrl}" style="width:100%; height:65vh; border:none; border-radius:4px;"></iframe>`;
  } else {
    content = `<p style="color:var(--gray-500); margin-bottom:8px;">No se puede previsualizar este tipo de archivo.</p><p><strong>${escapeHtml(nombre)}</strong></p>`;
  }

  document.querySelector('.modal')?.classList.add('modal-large');
  openModal(nombre, content, `<button class="btn btn-secondary modal-cancel-btn">Cerrar</button>`);

  const removeLarge = () => document.querySelector('.modal')?.classList.remove('modal-large');
  document.getElementById('modal-close')?.addEventListener('click', removeLarge, { once: true });
  document.querySelector('.modal-cancel-btn')?.addEventListener('click', removeLarge, { once: true });
}

async function openInvoiceModal() {
  if (clients.length === 0) {
    showToast('Debe crear al menos un paciente antes de generar una factura', 'warning');
    return;
  }

  if (treatments.length === 0) {
    showToast('Debe crear al menos un servicio antes de generar una factura', 'warning');
    return;
  }
  
  const numResult = await window.api.invoices.getNextNumber();
  const numeroFactura = numResult.numero_factura;
  
  let treatmentOptions = treatments.map(t => 
    `<option value="${t.id}" data-price="${t.precio}" data-name="${t.nombre}">${t.nombre} - ${t.precio.toFixed(2)} €</option>`
  ).join('');
  
  const body = `
    <form id="invoice-form">
      <div class="form-group">
        <label>Paciente *</label>
        <input type="text" id="invoice-client-search" class="form-control" placeholder="Buscar paciente por código, nombre o DNI...">
        <div id="invoice-client-list" style="max-height: 200px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 4px; display: none;">
        </div>
        <div id="invoice-selected-client" class="hidden" style="padding: 12px; background: #e0f2fe; border-radius: 8px; margin-top: 8px;">
          <strong>Paciente seleccionado:</strong> <span id="selected-client-name"></span>
          <button type="button" class="btn btn-danger btn-sm" id="clear-client-btn" style="margin-left: 8px;">Cambiar</button>
        </div>
      </div>
      <input type="hidden" id="invoice-client-id" required>
      <div class="form-group">
        <label for="invoice-number">Número de Factura</label>
        <input type="text" id="invoice-number" class="form-control" value="${numeroFactura}" readonly>
      </div>
      <div class="form-group">
        <label>Conceptos</label>
        <table id="invoice-items-table">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Cantidad</th>
              <th>Precio</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="invoice-items-body">
          </tbody>
        </table>
        <button type="button" class="btn btn-secondary btn-sm" id="add-invoice-item-btn" style="margin-top: 8px;">+ Añadir Concepto</button>
      </div>
      <div class="form-group">
        <label for="invoice-observaciones">Observaciones</label>
        <textarea id="invoice-observaciones" class="form-control" rows="2"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="invoice-estado">Estado</label>
          <select id="invoice-estado" class="form-control">
            <option value="Borrador">Borrador</option>
            <option value="Emitida" selected>Emitida</option>
            <option value="Pagada">Pagada</option>
          </select>
        </div>
        <div class="form-group">
          <label for="invoice-metodo-pago">Método de Pago</label>
          <select id="invoice-metodo-pago" class="form-control">
            <option value="">-- Sin especificar --</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>
      </div>
      <div class="form-group" id="invoice-fecha-pago-group" style="display:none;">
        <label for="invoice-fecha-pago">Fecha de Pago</label>
        <input type="date" id="invoice-fecha-pago" class="form-control">
      </div>
      <div style="text-align: right; margin-top: 16px;">
        <p>Subtotal: <span id="invoice-subtotal">0.00</span> €</p>
        <p>IVA (21%): <span id="invoice-iva">0.00</span> €</p>
        <p><strong>Total: <span id="invoice-total">0.00</span> €</strong></p>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary modal-cancel-btn">Cancelar</button>
    <button class="btn btn-success" id="invoice-save-btn">Crear Factura</button>
  `;

  openModal('Nueva Factura', body, footer);

  document.getElementById('invoice-estado').addEventListener('change', (e) => {
    document.getElementById('invoice-fecha-pago-group').style.display =
      e.target.value === 'Pagada' ? 'block' : 'none';
  });
  
  const clientSearch = document.getElementById('invoice-client-search');
  const clientList = document.getElementById('invoice-client-list');
  const selectedClientDiv = document.getElementById('invoice-selected-client');
  const selectedClientName = document.getElementById('selected-client-name');
  const clientIdInput = document.getElementById('invoice-client-id');
  
  function renderClientList(filteredClients) {
    if (filteredClients.length === 0) {
      clientList.innerHTML = '<div style="padding: 12px; color: #6b7280;">No se encontraron pacientes</div>';
      return;
    }
    clientList.innerHTML = filteredClients.map(c => `
      <div class="client-list-item" data-id="${c.id}" data-name="${c.codigo} - ${c.nombre} ${c.apellidos || ''}" 
           style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6;">
        <strong>${c.codigo}</strong> - ${c.nombre} ${c.apellidos || ''} <br>
        <small style="color: #6b7280;">${c.dni || ''} ${c.telefono || ''}</small>
      </div>
    `).join('');
    
    clientList.querySelectorAll('.client-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const clientId = item.dataset.id;
        const clientName = item.dataset.name;
        clientIdInput.value = clientId;
        selectedClientName.textContent = clientName;
        clientList.style.display = 'none';
        clientSearch.value = '';
        selectedClientDiv.classList.remove('hidden');
      });
    });
  }
  
  clientSearch.addEventListener('input', (e) => {
    const search = e.target.value.toLowerCase();
    if (search.length === 0) {
      clientList.style.display = 'none';
      return;
    }
    
    const filtered = clients.filter(c => 
      c.codigo.toLowerCase().includes(search) ||
      c.nombre.toLowerCase().includes(search) ||
      (c.apellidos && c.apellidos.toLowerCase().includes(search)) ||
      (c.dni && c.dni.toLowerCase().includes(search)) ||
      (c.telefono && c.telefono.includes(search))
    );
    
    clientList.style.display = 'block';
    renderClientList(filtered);
  });
  
  clientSearch.addEventListener('focus', () => {
    if (clientSearch.value.length > 0) {
      clientList.style.display = 'block';
      renderClientList(clients);
    }
  });
  
  document.getElementById('clear-client-btn').addEventListener('click', () => {
    clientIdInput.value = '';
    selectedClientDiv.classList.add('hidden');
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-group')) {
      clientList.style.display = 'none';
    }
  });
  
  let invoiceItems = [];
  
  document.getElementById('add-invoice-item-btn').addEventListener('click', () => {
    addInvoiceItem();
  });
  
  function addInvoiceItem() {
    const tbody = document.getElementById('invoice-items-body');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <select class="form-control item-treatment" onchange="updateItemPrice(this)">
          <option value="">-- Seleccionar --</option>
          ${treatmentOptions}
        </select>
      </td>
      <td><input type="number" class="form-control item-quantity" value="1" min="1" style="width: 80px;"></td>
      <td><input type="number" class="form-control item-price" value="0" step="0.01" style="width: 100px;"></td>
      <td><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove(); calculateInvoiceTotals();">×</button></td>
    `;
    tbody.appendChild(row);
  }
  
  window.updateItemPrice = (select) => {
    const option = select.options[select.selectedIndex];
    const price = option.dataset.price || 0;
    select.closest('tr').querySelector('.item-price').value = price;
    calculateInvoiceTotals();
  };
  
  function calculateInvoiceTotals() {
    let subtotal = 0;
    document.querySelectorAll('#invoice-items-body tr').forEach(row => {
      const price = parseFloat(row.querySelector('.item-price').value) || 0;
      const quantity = parseInt(row.querySelector('.item-quantity').value) || 1;
      subtotal += price * quantity;
    });
    
    const iva = subtotal * 0.21;
    const total = subtotal + iva;
    
    document.getElementById('invoice-subtotal').textContent = subtotal.toFixed(2);
    document.getElementById('invoice-iva').textContent = iva.toFixed(2);
    document.getElementById('invoice-total').textContent = total.toFixed(2);
  }
  
  document.getElementById('invoice-items-body').addEventListener('input', calculateInvoiceTotals);
  
  addInvoiceItem();
  
  document.getElementById('invoice-save-btn').addEventListener('click', async () => {
    const clienteId = document.getElementById('invoice-client-id').value;
    if (!clienteId) {
      showToast('Debe seleccionar un paciente', 'warning');
      return;
    }
    
    const items = [];
    document.querySelectorAll('#invoice-items-body tr').forEach(row => {
      const treatmentId = row.querySelector('.item-treatment').value;
      if (treatmentId) {
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        const quantity = parseInt(row.querySelector('.item-quantity').value) || 1;
        const iva = price * quantity * 0.21;
        items.push({
          tratamiento_id: parseInt(treatmentId),
          cantidad: quantity,
          precio: price,
          iva: iva
        });
      }
    });
    
    if (items.length === 0) {
      showToast('Debe añadir al menos un concepto', 'warning');
      return;
    }
    
    const subtotal = parseFloat(document.getElementById('invoice-subtotal').textContent);
    const iva = parseFloat(document.getElementById('invoice-iva').textContent);
    const total = parseFloat(document.getElementById('invoice-total').textContent);
    
    const data = {
      cliente_id: parseInt(clienteId),
      numero_factura: document.getElementById('invoice-number').value,
      subtotal: subtotal,
      iva: iva,
      total: total,
      observaciones: document.getElementById('invoice-observaciones').value,
      estado: document.getElementById('invoice-estado').value,
      metodo_pago: document.getElementById('invoice-metodo-pago').value || null,
      fecha_pago: document.getElementById('invoice-fecha-pago').value || null,
      items: items
    };

    const result = await window.api.invoices.create(data);

    if (result.success) {
      closeModal();
      await loadInvoices();
      showToast('✓ Factura creada correctamente', 'success');
    } else {
      showToast('Error: ' + result.error, 'error');
    }
  });
}

function openHistoryModal() {
  const clienteId = currentHistoryClientId;
  if (!clienteId) {
    showToast('Seleccione un paciente primero', 'warning');
    return;
  }

  let treatmentOptions = '<option value="">-- Sin tratamiento específico --</option>';
  treatmentOptions += treatments.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');

  const body = `
    <form id="history-form">
      <div class="form-group">
        <label for="history-treatment">Tratamiento</label>
        <select id="history-treatment" class="form-control">${treatmentOptions}</select>
      </div>
      <div class="form-group">
        <label>Plantilla de nota</label>
        ${templateSelectHtml('new')}
        <label for="history-notas">Notas Clínicas</label>
        <textarea id="history-notas" class="form-control" rows="6" placeholder="Notas sobre el tratamiento..."></textarea>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary modal-cancel-btn">Cancelar</button>
    <button class="btn btn-primary" id="history-save-btn">Guardar</button>
  `;

  openModal('Nueva Entrada Clínica', body, footer);

  document.getElementById('template-select-new')?.addEventListener('change', (e) => {
    if (e.target.value) {
      const notas = document.getElementById('history-notas');
      notas.value = (notas.value ? notas.value + '\n\n' : '') + e.target.value;
      e.target.value = '';
    }
  });

  document.getElementById('history-save-btn').addEventListener('click', async () => {
    const data = {
      cliente_id: parseInt(clienteId),
      tratamiento_id: document.getElementById('history-treatment').value
        ? parseInt(document.getElementById('history-treatment').value)
        : null,
      notas: document.getElementById('history-notas').value,
    };

    const result = await window.api.clinicHistory.create(data);

    if (result.success) {
      closeModal();
      await loadClientHistory(clienteId);
      showToast('✓ Guardado correctamente', 'success');
    } else {
      showToast('Error: ' + result.error, 'error');
    }
  });
}

async function generateReport() {
  const startDate = document.getElementById('report-start-date').value;
  const endDate   = document.getElementById('report-end-date').value;

  if (!startDate || !endDate) {
    showToast('Seleccione las fechas de inicio y fin', 'warning');
    return;
  }

  const result = await window.api.accounting.getReport(startDate, endDate);

  if (result.success) {
    const data = result.data;
    document.getElementById('report-results').classList.remove('hidden');

    const totalFacturas = data.reduce((s, d) => s + d.num_facturas, 0);
    const totalSubtotal = data.reduce((s, d) => s + (d.subtotal || 0), 0);
    const totalIva      = data.reduce((s, d) => s + (d.iva || 0), 0);
    const totalTotal    = data.reduce((s, d) => s + (d.total || 0), 0);

    document.getElementById('report-stats').innerHTML = `
      <div class="stat-card"><h4>Total Facturas</h4><div class="value">${totalFacturas}</div></div>
      <div class="stat-card"><h4>Subtotal</h4><div class="value">${totalSubtotal.toFixed(2)} €</div></div>
      <div class="stat-card"><h4>IVA</h4><div class="value">${totalIva.toFixed(2)} €</div></div>
      <div class="stat-card"><h4>Total</h4><div class="value">${totalTotal.toFixed(2)} €</div></div>
    `;

    document.getElementById('report-table-body').innerHTML = data.map(d => `
      <tr>
        <td>${new Date(d.fecha).toLocaleDateString('es-ES')}</td>
        <td>${d.num_facturas}</td>
        <td>${(d.subtotal || 0).toFixed(2)} €</td>
        <td>${(d.iva || 0).toFixed(2)} €</td>
        <td>${(d.total || 0).toFixed(2)} €</td>
      </tr>
    `).join('');

    await renderTopTreatments(startDate, endDate);
    await renderRevenuePerClient(startDate, endDate);
  }
}

async function renderTopTreatments(startDate, endDate) {
  const result = await window.api.accounting.getTopTreatments(startDate, endDate);
  if (!result.success) return;
  const tbody = document.getElementById('top-treatments-body');
  if (!tbody) return;
  tbody.innerHTML = result.data.length === 0
    ? '<tr><td colspan="4" style="text-align:center;color:#9ca3af;">Sin datos en el período</td></tr>'
    : result.data.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${r.nombre}</td>
          <td>${r.total_cantidad}</td>
          <td>${r.total_ingresos.toFixed(2)} €</td>
        </tr>
      `).join('');
}

async function renderRevenuePerClient(startDate, endDate) {
  const result = await window.api.accounting.getRevenuePerClient(startDate, endDate);
  if (!result.success) return;
  const tbody = document.getElementById('revenue-per-client-body');
  if (!tbody) return;
  tbody.innerHTML = result.data.length === 0
    ? '<tr><td colspan="3" style="text-align:center;color:#9ca3af;">Sin datos en el período</td></tr>'
    : result.data.map(r => `
        <tr>
          <td>${r.cliente}</td>
          <td>${r.num_facturas}</td>
          <td>${r.total_ingresos.toFixed(2)} €</td>
        </tr>
      `).join('');
}

function setupChartYearSelect() {
  const sel = document.getElementById('chart-year');
  if (!sel) return;
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 4; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => renderMonthlyChart(parseInt(sel.value)));
  renderMonthlyChart(currentYear);
}

async function renderMonthlyChart(year) {
  const result = await window.api.accounting.getMonthlyChart(year);
  if (!result.success) return;

  const svg = document.getElementById('monthly-chart-svg');
  if (!svg) return;

  const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const rows = result.data;
  const maxTotal = Math.max(...rows.map(r => r.total), 1);

  const allMonths = MONTHS.map((label, idx) => {
    const m = String(idx + 1).padStart(2, '0');
    const row = rows.find(r => r.mes === m);
    return { label, total: row ? row.total : 0 };
  });

  const W = 760, H = 220, padLeft = 50, padBottom = 30, padTop = 20;
  const chartH = H - padBottom - padTop;
  const barW = 42, gap = 18;
  let content = '';

  // Y axis
  content += `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${H - padBottom}" stroke="#e5e7eb" stroke-width="1"/>`;
  // Y axis labels (3 levels)
  [0, 0.5, 1].forEach(frac => {
    const val = maxTotal * frac;
    const y = H - padBottom - chartH * frac;
    content += `<text x="${padLeft - 4}" y="${y + 4}" text-anchor="end" font-size="9" fill="#9ca3af">${val.toFixed(0)}</text>`;
    content += `<line x1="${padLeft}" y1="${y}" x2="${W - 10}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>`;
  });

  allMonths.forEach((m, i) => {
    const barH = m.total > 0 ? Math.round(chartH * m.total / maxTotal) : 0;
    const x = padLeft + 10 + i * (barW + gap);
    const y = H - padBottom - barH;
    content += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#0ea5e9" rx="3" opacity="0.85"/>`;
    content += `<text x="${x + barW / 2}" y="${H - padBottom + 14}" text-anchor="middle" font-size="10" fill="#6b7280">${m.label}</text>`;
    if (barH > 8) {
      content += `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#0284c7">${m.total.toFixed(0)}</text>`;
    }
  });

  svg.innerHTML = content;
}

async function generateVATReport() {
  const year    = parseInt(document.getElementById('vat-year').value);
  const quarter = parseInt(document.getElementById('vat-quarter').value);

  const result = await window.api.accounting.getVatReport(year, quarter);

  if (result.success) {
    const data = result.data;
    document.getElementById('vat-results').classList.remove('hidden');
    document.getElementById('vat-period').textContent = `${quarter}º Trimestre ${year}`;
    document.getElementById('vat-total').textContent = `${data.totalIva.toFixed(2)} €`;
    const subEl   = document.getElementById('vat-subtotal');
    const countEl = document.getElementById('vat-count');
    if (subEl)   subEl.textContent   = `${data.totalSubtotal.toFixed(2)} €`;
    if (countEl) countEl.textContent = data.numFacturas;
  }
}

// CSV export buttons
document.getElementById('export-report-csv-btn')?.addEventListener('click', async () => {
  const startDate = document.getElementById('report-start-date').value;
  const endDate   = document.getElementById('report-end-date').value;
  if (!startDate || !endDate) { showToast('Seleccione primero un rango de fechas', 'warning'); return; }
  const r = await window.api.accounting.exportCsv('invoices', startDate, endDate, null, null);
  if (r.success) showToast('CSV guardado en Descargas: ' + r.filePath, 'success');
  else showToast('Error exportando CSV: ' + r.error, 'error');
});

document.getElementById('export-vat-csv-btn')?.addEventListener('click', async () => {
  const year    = parseInt(document.getElementById('vat-year').value);
  const quarter = parseInt(document.getElementById('vat-quarter').value);
  const r = await window.api.accounting.exportCsv('vat', null, null, year, quarter);
  if (r.success) showToast('CSV guardado en Descargas: ' + r.filePath, 'success');
  else showToast('Error exportando CSV: ' + r.error, 'error');
});

function setupHistorySearch() {
  document.getElementById('toggle-notes-search-header')?.addEventListener('click', () => {
    const panel = document.getElementById('notes-search-panel');
    const icon  = document.getElementById('toggle-notes-search-icon');
    if (panel.classList.toggle('hidden')) {
      icon.textContent = '▾';
    } else {
      icon.textContent = '▴';
    }
  });

  const doSearch = async () => {
    const query = document.getElementById('history-notes-search')?.value || '';
    if (!query.trim()) return;

    const r = await window.api.clinicHistory.search(query);
    const resultsDiv  = document.getElementById('history-notes-results');
    const resultsBody = document.getElementById('history-notes-results-body');

    if (!r.success) {
      showToast('Error en búsqueda: ' + r.error, 'error');
      return;
    }

    resultsDiv.classList.remove('hidden');

    if (r.data.length === 0) {
      resultsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray-400);">Sin resultados</td></tr>';
      return;
    }

    const q = query.trim().toLowerCase();
    resultsBody.innerHTML = r.data.map(entry => {
      const notas = entry.notas || '';
      const idx   = notas.toLowerCase().indexOf(q);
      const extract = idx >= 0
        ? '...' + escapeHtml(notas.substring(Math.max(0, idx - 30), idx + 60)) + '...'
        : escapeHtml(notas.substring(0, 80)) + (notas.length > 80 ? '...' : '');
      const clientId = entry.cliente_id || entry.cliente_id_val;
      return `
        <tr>
          <td>${new Date(entry.fecha).toLocaleDateString('es-ES')}</td>
          <td><strong>${escapeHtml(entry.cliente_codigo || '')}</strong> ${escapeHtml(entry.cliente_nombre || '')} ${escapeHtml(entry.cliente_apellidos || '')}</td>
          <td>${escapeHtml(entry.tratamiento_nombre || '-')}</td>
          <td style="font-size:12px; color:var(--gray-600); max-width:260px;">${extract}</td>
          <td><button class="btn btn-primary btn-sm" onclick="viewClientHistory(${clientId})">Ver historial</button></td>
        </tr>
      `;
    }).join('');
  };

  document.getElementById('history-notes-search-btn')?.addEventListener('click', doSearch);
  document.getElementById('history-notes-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

const today = new Date();
const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

document.getElementById('report-start-date').value = startOfMonth.toISOString().split('T')[0];
document.getElementById('report-end-date').value = endOfMonth.toISOString().split('T')[0];
