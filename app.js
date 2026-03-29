/* ─── Storage ───────────────────────────────────────────────────────────── */
const STORAGE_KEY = 'nwt_snapshots_v1';

function loadSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSnapshots(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function fmt(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function fmtChange(value) {
  const sign = value > 0 ? '+' : '';
  return sign + fmt(value);
}

function fmtPct(value) {
  if (!isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(1) + '%';
}

function sortedMonths(snapshots) {
  return Object.keys(snapshots).sort();
}

function monthLabel(ym) {
  // ym = "2024-03"
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function totalNetWorth(snapshot) {
  return snapshot.reduce((s, r) => s + r.value, 0);
}

/* ─── Chart instances ───────────────────────────────────────────────────── */
let trendChart = null;
let donutChart = null;

const PALETTE = [
  '#4f6ef7','#22c55e','#f59e0b','#ec4899','#14b8a6',
  '#8b5cf6','#f97316','#06b6d4','#84cc16','#e11d48',
  '#0ea5e9','#a855f7','#10b981','#f43f5e','#64748b',
];

/* ─── Main Render ────────────────────────────────────────────────────────── */
function render() {
  const snapshots = loadSnapshots();
  const months = sortedMonths(snapshots);
  const hasData = months.length > 0;

  document.getElementById('emptyState').style.display = hasData ? 'none' : '';
  document.getElementById('summaryStrip').hidden = !hasData;
  document.getElementById('chartsRow').hidden = !hasData;
  document.getElementById('changesCard').hidden = !hasData;
  document.getElementById('snapshotsCard').hidden = !hasData;

  if (!hasData) return;

  const latest = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : null;
  const latestData = snapshots[latest];
  const nw = totalNetWorth(latestData);
  const prevNw = prev ? totalNetWorth(snapshots[prev]) : null;

  // Summary strip
  document.getElementById('netWorthVal').textContent = fmt(nw);
  document.getElementById('assetsVal').textContent = latestData.length;
  document.getElementById('snapshotsVal').textContent = months.length;
  document.getElementById('latestMonth').textContent = monthLabel(latest);

  const changeEl = document.getElementById('netWorthChange');
  if (prevNw !== null) {
    const delta = nw - prevNw;
    const pct = (delta / prevNw) * 100;
    changeEl.textContent = `${fmtChange(delta)} (${fmtPct(pct)}) vs last month`;
    changeEl.className = 'summ-change ' + (delta >= 0 ? 'positive' : 'negative');
  } else {
    changeEl.textContent = 'First snapshot';
    changeEl.className = 'summ-change';
  }

  renderTrendChart(snapshots, months);
  populateSelects(months);
  renderDonutChart(snapshots, document.getElementById('breakdownMonth').value || latest);
  renderChangesTable(snapshots, months);
  renderSnapshotsTable(snapshots, months);
}

/* ─── Trend Chart ────────────────────────────────────────────────────────── */
function renderTrendChart(snapshots, months) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  const data = months.map(m => ({ x: monthLabel(m), y: totalNetWorth(snapshots[m]) }));

  if (trendChart) trendChart.destroy();

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.x),
      datasets: [{
        label: 'Net Worth',
        data: data.map(d => d.y),
        borderColor: '#4f6ef7',
        backgroundColor: 'rgba(79,110,247,.12)',
        borderWidth: 2.5,
        pointRadius: 5,
        pointBackgroundColor: '#4f6ef7',
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + fmt(ctx.parsed.y),
          }
        }
      },
      scales: {
        y: {
          ticks: { callback: v => fmt(v), font: { size: 11 } },
          grid: { color: 'rgba(128,128,128,.12)' },
        },
        x: {
          ticks: { font: { size: 11 } },
          grid: { display: false },
        }
      }
    }
  });
}

/* ─── Donut Chart ────────────────────────────────────────────────────────── */
function renderDonutChart(snapshots, month) {
  if (!snapshots[month]) return;
  const ctx = document.getElementById('donutChart').getContext('2d');

  // Aggregate by category
  const cats = {};
  for (const row of snapshots[month]) {
    cats[row.category] = (cats[row.category] || 0) + row.value;
  }
  const labels = Object.keys(cats);
  const values = labels.map(l => cats[l]);

  if (donutChart) donutChart.destroy();

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderWidth: 2,
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--surface') || '#fff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, padding: 12, boxWidth: 14 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmt(ctx.parsed)}`,
          }
        }
      },
      cutout: '62%',
    }
  });
}

/* ─── Populate Selects ───────────────────────────────────────────────────── */
function populateSelects(months) {
  const breakdownSel = document.getElementById('breakdownMonth');
  const fromSel = document.getElementById('compareFrom');
  const toSel = document.getElementById('compareTo');

  const rebuild = (el, opts, selectedVal) => {
    const prev = el.value;
    el.innerHTML = '';
    opts.forEach(m => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = monthLabel(m);
      el.appendChild(o);
    });
    // Restore selection or use default
    if (selectedVal && opts.includes(selectedVal)) el.value = selectedVal;
    else if (prev && opts.includes(prev)) el.value = prev;
  };

  rebuild(breakdownSel, months, months[months.length - 1]);
  rebuild(fromSel, months, months.length >= 2 ? months[months.length - 2] : months[0]);
  rebuild(toSel, months, months[months.length - 1]);
}

/* ─── Changes Table ──────────────────────────────────────────────────────── */
function renderChangesTable(snapshots, months) {
  const fromSel = document.getElementById('compareFrom');
  const toSel = document.getElementById('compareTo');
  const fromMonth = fromSel.value;
  const toMonth = toSel.value;

  if (!fromMonth || !toMonth || !snapshots[fromMonth] || !snapshots[toMonth]) return;

  const fromData = snapshots[fromMonth];
  const toData = snapshots[toMonth];

  const fromMap = {};
  fromData.forEach(r => { fromMap[r.asset] = r; });
  const toMap = {};
  toData.forEach(r => { toMap[r.asset] = r; });

  const allAssets = new Set([...fromData.map(r => r.asset), ...toData.map(r => r.asset)]);

  let totalFrom = 0;
  let totalTo = 0;
  const rows = [];

  for (const asset of allAssets) {
    const f = fromMap[asset];
    const t = toMap[asset];
    const prevVal = f ? f.value : null;
    const currVal = t ? t.value : null;
    const category = (t || f).category;
    const delta = (currVal ?? 0) - (prevVal ?? 0);
    const pct = prevVal ? (delta / prevVal) * 100 : null;
    totalFrom += prevVal ?? 0;
    totalTo += currVal ?? 0;
    rows.push({ asset, category, prevVal, currVal, delta, pct, isNew: !f, isRemoved: !t });
  }

  // Sort: existing first sorted by |delta|, then new, then removed
  rows.sort((a, b) => {
    if (a.isRemoved && !b.isRemoved) return 1;
    if (!a.isRemoved && b.isRemoved) return -1;
    if (a.isNew && !b.isNew) return 1;
    if (!a.isNew && b.isNew) return -1;
    return Math.abs(b.delta) - Math.abs(a.delta);
  });

  const tbody = document.getElementById('changesBody');
  tbody.innerHTML = '';

  for (const r of rows) {
    const tr = document.createElement('tr');
    const changeClass = r.delta > 0 ? 'change-pos' : r.delta < 0 ? 'change-neg' : 'change-zero';

    const nameBadge = r.isNew
      ? `<span class="new-badge">NEW</span>`
      : r.isRemoved ? `<span class="removed-badge">REMOVED</span>` : '';

    tr.innerHTML = `
      <td>${r.asset}${nameBadge}</td>
      <td><span class="category-badge">${r.category}</span></td>
      <td class="num">${r.prevVal !== null ? fmt(r.prevVal) : '—'}</td>
      <td class="num">${r.currVal !== null ? fmt(r.currVal) : '—'}</td>
      <td class="num ${changeClass}">${fmtChange(r.delta)}</td>
      <td class="num ${changeClass}">${r.pct !== null ? fmtPct(r.pct) : '—'}</td>
    `;
    tbody.appendChild(tr);
  }

  const totalDelta = totalTo - totalFrom;
  const totalPct = totalFrom ? (totalDelta / totalFrom) * 100 : null;
  const totClass = totalDelta >= 0 ? 'change-pos' : 'change-neg';

  document.getElementById('changesFoot').innerHTML = `
    <tr>
      <td colspan="2">Total</td>
      <td class="num">${fmt(totalFrom)}</td>
      <td class="num">${fmt(totalTo)}</td>
      <td class="num ${totClass}">${fmtChange(totalDelta)}</td>
      <td class="num ${totClass}">${totalPct !== null ? fmtPct(totalPct) : '—'}</td>
    </tr>
  `;
}

/* ─── Snapshots Table ────────────────────────────────────────────────────── */
function renderSnapshotsTable(snapshots, months) {
  const tbody = document.getElementById('snapshotsBody');
  tbody.innerHTML = '';

  for (const m of [...months].reverse()) {
    const data = snapshots[m];
    const nw = totalNetWorth(data);
    const cats = new Set(data.map(r => r.category)).size;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${monthLabel(m)}</strong></td>
      <td class="num">${fmt(nw)}</td>
      <td class="num">${data.length}</td>
      <td class="num">${cats}</td>
      <td><button class="btn-danger-sm" data-month="${m}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.btn-danger-sm').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.month;
      if (!confirm(`Delete snapshot for ${monthLabel(m)}?`)) return;
      const s = loadSnapshots();
      delete s[m];
      saveSnapshots(s);
      render();
    });
  });
}

/* ─── Upload Logic ───────────────────────────────────────────────────────── */
const csvFileInput = document.getElementById('csvFile');
const uploadBtn = document.getElementById('uploadBtn');
const fileLabelText = document.getElementById('fileLabelText');
const fileLabel = document.querySelector('.file-label');
const snapshotMonthInput = document.getElementById('snapshotMonth');
const uploadError = document.getElementById('uploadError');

// Set default month to current month
const now = new Date();
snapshotMonthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

let parsedRows = null;

csvFileInput.addEventListener('change', () => {
  const file = csvFileInput.files[0];
  if (!file) {
    fileLabelText.textContent = 'Choose CSV file…';
    fileLabel.classList.remove('has-file');
    parsedRows = null;
    uploadBtn.disabled = true;
    return;
  }

  fileLabelText.textContent = file.name;
  fileLabel.classList.add('has-file');

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase(),
    complete: result => {
      showError('');
      const errors = [];
      const rows = [];

      for (let i = 0; i < result.data.length; i++) {
        const raw = result.data[i];
        const asset = (raw.asset || raw.name || raw['asset name'] || '').trim();
        const category = (raw.category || raw.type || raw.class || 'Uncategorized').trim();
        const rawVal = (raw.value || raw.amount || raw.balance || '').toString().replace(/[$,\s]/g, '');
        const value = parseFloat(rawVal);

        if (!asset) { errors.push(`Row ${i + 2}: missing asset name`); continue; }
        if (isNaN(value)) { errors.push(`Row ${i + 2}: invalid value "${raw.value || raw.amount || raw.balance}"`); continue; }

        rows.push({ asset, category, value });
      }

      if (errors.length) {
        showError('Parsing warnings:\n' + errors.slice(0, 5).join('\n'));
      }

      if (rows.length === 0) {
        showError('No valid rows found. Check your CSV headers (Asset, Category, Value).');
        parsedRows = null;
        uploadBtn.disabled = true;
        return;
      }

      parsedRows = rows;
      uploadBtn.disabled = false;
    },
    error: err => {
      showError('Failed to parse CSV: ' + err.message);
      parsedRows = null;
      uploadBtn.disabled = true;
    }
  });
});

uploadBtn.addEventListener('click', () => {
  const month = snapshotMonthInput.value;
  if (!month) { showError('Please select a month.'); return; }
  if (!parsedRows) { showError('No valid data to import.'); return; }

  const snapshots = loadSnapshots();
  if (snapshots[month] && !confirm(`A snapshot for ${monthLabel(month)} already exists. Overwrite it?`)) return;

  snapshots[month] = parsedRows;
  saveSnapshots(snapshots);

  // Reset upload form
  csvFileInput.value = '';
  fileLabelText.textContent = 'Choose CSV file…';
  fileLabel.classList.remove('has-file');
  parsedRows = null;
  uploadBtn.disabled = true;
  showError('');

  render();
});

function showError(msg) {
  uploadError.hidden = !msg;
  uploadError.textContent = msg;
}

/* ─── Select change listeners ────────────────────────────────────────────── */
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

/* ─── Theme Toggle ───────────────────────────────────────────────────────── */
const themeToggle = document.getElementById('themeToggle');
const saved = localStorage.getItem('nwt_theme');
if (saved) setTheme(saved);

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
});

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀' : '☾';
  localStorage.setItem('nwt_theme', theme);

  // Re-render charts so border color updates
  const s = loadSnapshots();
  const months = sortedMonths(s);
  if (months.length) {
    renderTrendChart(s, months);
    renderDonutChart(s, document.getElementById('breakdownMonth').value || months[months.length - 1]);
  }
}

/* ─── Sample CSV Download ────────────────────────────────────────────────── */
document.getElementById('downloadSample').addEventListener('click', () => {
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

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample_assets.csv';
  a.click();
  URL.revokeObjectURL(url);
});

/* ─── Init ───────────────────────────────────────────────────────────────── */
render();
