/* ══════════════════════════════════════════════════════════════
   NET WORTH TRACKER — app.js
   ══════════════════════════════════════════════════════════════ */

/* ── Storage ─────────────────────────────────────────────────── */
const STORAGE_KEY = 'nwt_snapshots_v1';

function loadSnapshots() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveSnapshots(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* ── Formatters ──────────────────────────────────────────────── */
function fmt(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function fmtChange(v) {
  return (v > 0 ? '+' : '') + fmt(v);
}

function fmtPct(v) {
  if (!isFinite(v)) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function sortedMonths(snapshots) {
  return Object.keys(snapshots).sort();
}

function totalNetWorth(snapshot) {
  return snapshot.reduce((s, r) => s + r.value, 0);
}

/* ── Toast system ────────────────────────────────────────────── */
function toast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;

  const icons = {
    success: '<polyline points="20 6 9 17 4 12"/>',
    error:   '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    info:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  };

  el.innerHTML = `
    <div class="toast-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${icons[type] || icons.info}</svg>
    </div>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 3500);
}

/* ── Modal (replaces browser confirm) ───────────────────────── */
let modalResolve = null;

function showModal(title, message) {
  return new Promise(resolve => {
    modalResolve = resolve;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('modalOverlay').hidden = false;
    document.getElementById('modalConfirm').focus();
  });
}

document.getElementById('modalConfirm').addEventListener('click', () => {
  document.getElementById('modalOverlay').hidden = true;
  if (modalResolve) { modalResolve(true); modalResolve = null; }
});

document.getElementById('modalCancel').addEventListener('click', () => {
  document.getElementById('modalOverlay').hidden = true;
  if (modalResolve) { modalResolve(false); modalResolve = null; }
});

document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) {
    document.getElementById('modalOverlay').hidden = true;
    if (modalResolve) { modalResolve(false); modalResolve = null; }
  }
});

/* ── Chart instances ─────────────────────────────────────────── */
let trendChart = null;
let donutChart = null;

const PALETTE = [
  '#4361EE','#10B981','#F59E0B','#EC4899','#14B8A6',
  '#8B5CF6','#F97316','#06B6D4','#84CC16','#E11D48',
  '#0EA5E9','#A855F7','#22C55E','#F43F5E','#64748B',
];

/* ── Animated counter ────────────────────────────────────────── */
function animateValue(el, target, formatter, duration = 600) {
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = formatter(from + (target - from) * ease);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ══════════════════════════════════════════════════════════════
   MAIN RENDER
   ══════════════════════════════════════════════════════════════ */
function render() {
  const snapshots = loadSnapshots();
  const months = sortedMonths(snapshots);
  const hasData = months.length > 0;

  // Show/hide sections
  document.getElementById('emptyState').style.display   = hasData ? 'none' : '';
  document.getElementById('heroSection').hidden         = !hasData;
  document.getElementById('kpiStrip').hidden            = !hasData;
  document.getElementById('chartsGrid').hidden          = !hasData;
  document.getElementById('compareTableCard').hidden    = !hasData;
  document.getElementById('compareSelectors').hidden    = !hasData;
  document.getElementById('compareEmpty').hidden        = hasData;
  document.getElementById('historyTableCard').hidden    = !hasData;
  document.getElementById('historyEmpty').hidden        = hasData;

  if (!hasData) return;

  const latest  = months[months.length - 1];
  const prev    = months.length > 1 ? months[months.length - 2] : null;
  const latestD = snapshots[latest];
  const nw      = totalNetWorth(latestD);
  const prevNw  = prev ? totalNetWorth(snapshots[prev]) : null;

  /* Hero */
  animateValue(document.getElementById('heroNetWorth'), nw, fmt, 700);

  const heroChange = document.getElementById('heroChange');
  if (prevNw !== null) {
    const delta = nw - prevNw;
    const pct   = (delta / prevNw) * 100;
    heroChange.textContent = `${fmtChange(delta)} (${fmtPct(pct)}) vs ${monthLabel(prev)}`;
    heroChange.className = 'hero-change ' + (delta >= 0 ? 'positive' : 'negative');
  } else {
    heroChange.textContent = 'First snapshot — keep going!';
    heroChange.className = 'hero-change';
  }

  /* KPI cards */
  document.getElementById('kpiAssets').textContent    = latestD.length;
  document.getElementById('kpiAssetsSub').textContent = `across ${new Set(latestD.map(r => r.category)).size} categories`;

  const largest = [...latestD].sort((a, b) => b.value - a.value)[0];
  document.getElementById('kpiLargest').textContent    = largest ? fmt(largest.value) : '—';
  document.getElementById('kpiLargestSub').textContent = largest ? largest.asset : '';

  const cats = new Set(latestD.map(r => r.category));
  document.getElementById('kpiCategories').textContent    = cats.size;
  document.getElementById('kpiCategoriesSub').textContent = [...cats].slice(0, 2).join(', ') + (cats.size > 2 ? '…' : '');

  if (prevNw !== null) {
    const delta = nw - prevNw;
    const pct   = (delta / prevNw) * 100;
    document.getElementById('kpiGrowth').textContent    = fmtPct(pct);
    document.getElementById('kpiGrowthSub').textContent = fmtChange(delta);
    document.getElementById('kpiGrowth').style.color    = delta >= 0 ? 'var(--success)' : 'var(--danger)';
    document.getElementById('kpiGrowthIcon').className  = 'kpi-icon ' + (delta >= 0 ? 'kpi-icon--green' : 'kpi-icon--red');
    document.getElementById('kpiGrowthIcon').innerHTML  = delta >= 0
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`;
  } else {
    document.getElementById('kpiGrowth').textContent    = '—';
    document.getElementById('kpiGrowthSub').textContent = 'Need 2+ snapshots';
    document.getElementById('kpiGrowth').style.color    = '';
  }

  /* Trend meta */
  if (months.length >= 2) {
    const first = months[0];
    const allNw = months.map(m => totalNetWorth(snapshots[m]));
    const total = allNw[allNw.length - 1] - allNw[0];
    document.getElementById('trendMeta').textContent =
      `${monthLabel(first)} → ${monthLabel(latest)} · ${fmtChange(total)} total`;
  }

  renderTrendChart(snapshots, months);
  populateSelects(months);
  renderDonutChart(snapshots, document.getElementById('breakdownMonth').value || latest);
  renderChangesTable(snapshots, months);
  renderSnapshotsTable(snapshots, months);
}

/* ── Trend chart ─────────────────────────────────────────────── */
function renderTrendChart(snapshots, months) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  const labels = months.map(monthLabel);
  const data   = months.map(m => totalNetWorth(snapshots[m]));

  if (trendChart) trendChart.destroy();

  // Build gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 280);
  gradient.addColorStop(0, 'rgba(67,97,238,.18)');
  gradient.addColorStop(1, 'rgba(67,97,238,.0)');

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Net Worth',
        data,
        borderColor: '#4361EE',
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#4361EE',
        pointBorderWidth: 2.5,
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          borderWidth: 1,
          titleColor: 'var(--text-muted)',
          bodyColor: 'var(--text)',
          titleFont: { family: 'Inter', size: 11, weight: '500' },
          bodyFont: { family: 'Inter', size: 13, weight: '700' },
          padding: 10,
          callbacks: {
            label: ctx => ' ' + fmt(ctx.parsed.y),
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: v => fmt(v),
            font: { family: 'Inter', size: 11 },
            color: 'var(--text-muted)',
            maxTicksLimit: 6,
          },
          grid: { color: 'rgba(148,163,184,.12)' },
          border: { display: false },
        },
        x: {
          ticks: { font: { family: 'Inter', size: 11 }, color: 'var(--text-muted)' },
          grid: { display: false },
          border: { display: false },
        }
      }
    }
  });
}

/* ── Donut chart ─────────────────────────────────────────────── */
function renderDonutChart(snapshots, month) {
  if (!snapshots[month]) return;
  const ctx = document.getElementById('donutChart').getContext('2d');

  const cats = {};
  for (const row of snapshots[month]) {
    cats[row.category] = (cats[row.category] || 0) + row.value;
  }
  const labels = Object.keys(cats);
  const values = labels.map(l => cats[l]);

  if (donutChart) donutChart.destroy();

  const surfaceColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--surface').trim() || '#ffffff';

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderWidth: 3,
        borderColor: surfaceColor,
        hoverBorderWidth: 3,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter', size: 11 },
            color: 'var(--text-muted)',
            padding: 14,
            boxWidth: 12,
            borderRadius: 3,
            usePointStyle: true,
            pointStyle: 'circle',
          }
        },
        tooltip: {
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          borderWidth: 1,
          titleColor: 'var(--text-muted)',
          bodyColor: 'var(--text)',
          titleFont: { family: 'Inter', size: 11 },
          bodyFont: { family: 'Inter', size: 12, weight: '600' },
          padding: 10,
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${fmt(ctx.parsed)} (${pct}%)`;
            },
          }
        }
      },
      cutout: '65%',
    }
  });
}

/* ── Populate selects ────────────────────────────────────────── */
function populateSelects(months) {
  const rebuild = (el, opts, defaultVal) => {
    const prev = el.value;
    el.innerHTML = '';
    opts.forEach(m => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = monthLabel(m);
      el.appendChild(o);
    });
    if (defaultVal && opts.includes(defaultVal)) el.value = defaultVal;
    else if (prev && opts.includes(prev)) el.value = prev;
  };

  rebuild(document.getElementById('breakdownMonth'), months, months[months.length - 1]);
  rebuild(document.getElementById('compareFrom'),    months, months.length >= 2 ? months[months.length - 2] : months[0]);
  rebuild(document.getElementById('compareTo'),      months, months[months.length - 1]);
}

/* ── Changes table ───────────────────────────────────────────── */
function renderChangesTable(snapshots, months) {
  const fromMonth = document.getElementById('compareFrom').value;
  const toMonth   = document.getElementById('compareTo').value;

  if (!fromMonth || !toMonth || !snapshots[fromMonth] || !snapshots[toMonth]) return;

  const fromData = snapshots[fromMonth];
  const toData   = snapshots[toMonth];

  const fromMap = Object.fromEntries(fromData.map(r => [r.asset, r]));
  const toMap   = Object.fromEntries(toData.map(r => [r.asset, r]));

  const allAssets = new Set([...fromData.map(r => r.asset), ...toData.map(r => r.asset)]);
  let totalFrom = 0, totalTo = 0;
  const rows = [];

  for (const asset of allAssets) {
    const f = fromMap[asset];
    const t = toMap[asset];
    const prevVal = f ? f.value : null;
    const currVal = t ? t.value : null;
    const category = (t || f).category;
    const delta = (currVal ?? 0) - (prevVal ?? 0);
    const pct   = prevVal ? (delta / prevVal) * 100 : null;
    totalFrom += prevVal ?? 0;
    totalTo   += currVal ?? 0;
    rows.push({ asset, category, prevVal, currVal, delta, pct, isNew: !f, isRemoved: !t });
  }

  rows.sort((a, b) => {
    if (a.isRemoved !== b.isRemoved) return a.isRemoved ? 1 : -1;
    if (a.isNew     !== b.isNew)     return a.isNew     ? 1 : -1;
    return Math.abs(b.delta) - Math.abs(a.delta);
  });

  const tbody = document.getElementById('changesBody');
  tbody.innerHTML = '';

  for (const r of rows) {
    const cls = r.delta > 0 ? 'change-pos' : r.delta < 0 ? 'change-neg' : 'change-zero';
    const badge = r.isNew
      ? `<span class="badge badge-new">NEW</span>`
      : r.isRemoved ? `<span class="badge badge-removed">REMOVED</span>` : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.asset}${badge}</td>
      <td><span class="badge badge-category">${r.category}</span></td>
      <td class="num">${r.prevVal !== null ? fmt(r.prevVal) : '<span style="color:var(--text-faint)">—</span>'}</td>
      <td class="num">${r.currVal !== null ? fmt(r.currVal) : '<span style="color:var(--text-faint)">—</span>'}</td>
      <td class="num ${cls}">${fmtChange(r.delta)}</td>
      <td class="num ${cls}">${r.pct !== null ? fmtPct(r.pct) : '—'}</td>
    `;
    tbody.appendChild(tr);
  }

  const totalDelta = totalTo - totalFrom;
  const totalPct   = totalFrom ? (totalDelta / totalFrom) * 100 : null;
  const totCls     = totalDelta >= 0 ? 'change-pos' : 'change-neg';

  document.getElementById('changesFoot').innerHTML = `
    <tr>
      <td colspan="2" style="font-weight:700">Total</td>
      <td class="num">${fmt(totalFrom)}</td>
      <td class="num">${fmt(totalTo)}</td>
      <td class="num ${totCls}">${fmtChange(totalDelta)}</td>
      <td class="num ${totCls}">${totalPct !== null ? fmtPct(totalPct) : '—'}</td>
    </tr>
  `;
}

/* ── Snapshots table ─────────────────────────────────────────── */
function renderSnapshotsTable(snapshots, months) {
  const tbody = document.getElementById('snapshotsBody');
  tbody.innerHTML = '';

  const reversed = [...months].reverse();

  reversed.forEach((m, i) => {
    const data    = snapshots[m];
    const nw      = totalNetWorth(data);
    const prevM   = reversed[i + 1]; // the one before this in timeline
    const prevNw  = prevM ? totalNetWorth(snapshots[prevM]) : null;
    const cats    = new Set(data.map(r => r.category)).size;

    let changeTd = '<span style="color:var(--text-faint)">—</span>';
    if (prevNw !== null) {
      const delta = nw - prevNw;
      const pct   = (delta / prevNw) * 100;
      const cls   = delta >= 0 ? 'change-pos' : 'change-neg';
      changeTd    = `<span class="${cls}">${fmtChange(delta)} (${fmtPct(pct)})</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${monthLabel(m)}</strong></td>
      <td class="num">${fmt(nw)}</td>
      <td class="num">${changeTd}</td>
      <td class="num">${data.length}</td>
      <td class="num">${cats}</td>
      <td style="text-align:right"><button class="btn-danger-sm" data-month="${m}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-danger-sm').forEach(btn => {
    btn.addEventListener('click', async () => {
      const m = btn.dataset.month;
      const ok = await showModal(
        'Delete snapshot?',
        `This will permanently remove the snapshot for ${monthLabel(m)}. This action cannot be undone.`
      );
      if (!ok) return;
      const s = loadSnapshots();
      delete s[m];
      saveSnapshots(s);
      toast(`Snapshot for ${monthLabel(m)} deleted.`, 'info');
      render();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   IMPORT PANEL
   ══════════════════════════════════════════════════════════════ */
const importPanel     = document.getElementById('importPanel');
const csvFileInput    = document.getElementById('csvFile');
const dropZone        = document.getElementById('dropZone');
const importFooter    = document.getElementById('importFooter');
const importFileName  = document.getElementById('importFileName');
const importFileMeta  = document.getElementById('importFileMeta');
const uploadBtn       = document.getElementById('uploadBtn');
const uploadError     = document.getElementById('uploadError');
const snapshotMonth   = document.getElementById('snapshotMonth');

let parsedRows = null;

// Default month = current month
const now = new Date();
snapshotMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

function openImport() {
  importPanel.classList.add('open');
  importPanel.setAttribute('aria-hidden', 'false');
}

function closeImportPanel() {
  importPanel.classList.remove('open');
  importPanel.setAttribute('aria-hidden', 'true');
}

['sidebarImportBtn', 'topbarImportBtn', 'emptyImportBtn'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', () => {
    openImport();
    importPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

document.getElementById('closeImport').addEventListener('click', closeImportPanel);

/* Drag & drop */
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

['dragleave', 'dragend'].forEach(ev => {
  dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over'));
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

csvFileInput.addEventListener('change', () => {
  if (csvFileInput.files[0]) handleFile(csvFileInput.files[0]);
});

document.getElementById('clearFile').addEventListener('click', () => {
  csvFileInput.value = '';
  parsedRows = null;
  importFooter.hidden = true;
  uploadBtn.disabled = true;
  showImportError('');
});

function handleFile(file) {
  showImportError('');

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase(),
    complete: result => {
      const errors = [];
      const rows   = [];

      for (let i = 0; i < result.data.length; i++) {
        const raw  = result.data[i];
        const asset    = (raw.asset || raw.name || raw['asset name'] || '').trim();
        const category = (raw.category || raw.type || raw.class || 'Uncategorized').trim();
        const rawVal   = (raw.value || raw.amount || raw.balance || '').toString().replace(/[$,\s]/g, '');
        const value    = parseFloat(rawVal);

        if (!asset)     { errors.push(`Row ${i + 2}: missing asset name`); continue; }
        if (isNaN(value)) { errors.push(`Row ${i + 2}: invalid value "${raw.value ?? raw.amount ?? raw.balance}"`); continue; }
        rows.push({ asset, category, value });
      }

      if (errors.length) {
        showImportError('Parse warnings:\n' + errors.slice(0, 5).join('\n'));
      }

      if (rows.length === 0) {
        showImportError('No valid rows found. Check headers: Asset, Category, Value.');
        parsedRows = null;
        uploadBtn.disabled = true;
        return;
      }

      parsedRows = rows;

      // Show file preview
      const sizeKb = (file.size / 1024).toFixed(1);
      importFileName.textContent = file.name;
      importFileMeta.textContent = `${rows.length} assets · ${sizeKb} KB`;
      importFooter.hidden = false;
      uploadBtn.disabled  = false;
    },
    error: err => {
      showImportError('Failed to parse CSV: ' + err.message);
      parsedRows = null;
      uploadBtn.disabled = true;
    }
  });
}

uploadBtn.addEventListener('click', async () => {
  const month = snapshotMonth.value;
  if (!month)      { showImportError('Please select a month.'); return; }
  if (!parsedRows) { showImportError('No valid data to import.'); return; }

  const snapshots = loadSnapshots();

  if (snapshots[month]) {
    const ok = await showModal(
      'Overwrite snapshot?',
      `A snapshot for ${monthLabel(month)} already exists. Do you want to replace it?`
    );
    if (!ok) return;
    document.getElementById('modalConfirm').textContent = 'Overwrite';
  }

  snapshots[month] = parsedRows;
  saveSnapshots(snapshots);

  // Reset
  csvFileInput.value = '';
  parsedRows = null;
  importFooter.hidden = true;
  uploadBtn.disabled  = true;
  showImportError('');
  closeImportPanel();

  toast(`Snapshot for ${monthLabel(month)} imported (${snapshots[month].length} assets).`, 'success');
  render();
});

function showImportError(msg) {
  uploadError.hidden = !msg;
  uploadError.textContent = msg;
}

/* ══════════════════════════════════════════════════════════════
   NAVIGATION (sidebar tabs)
   ══════════════════════════════════════════════════════════════ */
const panelTitles = { overview: 'Overview', compare: 'Compare', history: 'History' };

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.dataset.panel;

    // Active nav item
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Active panel
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${panelId}`)?.classList.add('active');

    // Topbar title
    document.getElementById('topbarTitle').textContent = panelTitles[panelId] || '';

    // Close sidebar on mobile
    if (window.innerWidth <= 768) closeSidebar();
  });
});

/* ── Mobile sidebar toggle ───────────────────────────────────── */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('visible');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('visible');
}

document.getElementById('menuBtn').addEventListener('click', () => {
  const isOpen = document.getElementById('sidebar').classList.contains('open');
  isOpen ? closeSidebar() : openSidebar();
});

document.getElementById('sidebarBackdrop').addEventListener('click', closeSidebar);

/* ── Theme toggle ────────────────────────────────────────────── */
const savedTheme = localStorage.getItem('nwt_theme');
if (savedTheme) setTheme(savedTheme);

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
});

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('nwt_theme', theme);

  // Re-render charts so colors update
  const s = loadSnapshots();
  const months = sortedMonths(s);
  if (months.length) {
    renderTrendChart(s, months);
    renderDonutChart(s, document.getElementById('breakdownMonth').value || months[months.length - 1]);
  }
}

/* ── Select listeners ────────────────────────────────────────── */
document.getElementById('breakdownMonth').addEventListener('change', e => {
  renderDonutChart(loadSnapshots(), e.target.value);
});

document.getElementById('compareFrom').addEventListener('change', () => {
  const s = loadSnapshots();
  renderChangesTable(s, sortedMonths(s));
});

document.getElementById('compareTo').addEventListener('change', () => {
  const s = loadSnapshots();
  renderChangesTable(s, sortedMonths(s));
});

/* ── Sample CSV ──────────────────────────────────────────────── */
function downloadSample() {
  const csv = [
    'Asset,Category,Value',
    'Primary Home,Real Estate,425000',
    'Savings Account,Cash,32000',
    'Checking Account,Cash,8500',
    '401(k),Retirement,185000',
    'Roth IRA,Retirement,48000',
    'Brokerage Account,Investments,76000',
    'Car,Vehicles,22000',
    'Crypto,Investments,15000',
  ].join('\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'sample_assets.csv' });
  a.click();
  URL.revokeObjectURL(url);
  toast('Sample CSV downloaded.', 'info');
}

document.getElementById('downloadSample').addEventListener('click', downloadSample);
document.getElementById('emptySampleBtn').addEventListener('click', downloadSample);

/* ── Init ────────────────────────────────────────────────────── */
render();
