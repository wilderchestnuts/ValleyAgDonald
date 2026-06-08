/* ═══════════════════════════════════════════════════════
   app.js — Main application: degree days, map, charts
   ═══════════════════════════════════════════════════════ */

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────
const AURORA_LAT   = 45.247;
const AURORA_LON   = -122.770;
const DD_BASE      = 50;          // °F
const DD_BIOFIX    = '04-01';     // April 1 each year
const THRESHOLD_SINGLE = 5;       // moths/trap — action level
const THRESHOLD_AVG    = 5;       // regional avg — action level

// Filbertworm phenology thresholds (DD base 50°F from April 1)
const DD_FIRST_FLIGHT  = 610;
const DD_EGG_HATCH     = 1023;
const DD_PEAK_ADULT    = 1188;

// Historical avg daily DD (base 50°F) by month — Willamette Valley
// Used to project rest-of-season when live data runs out
const HIST_MONTHLY_DD = { 4: 2.2, 5: 4.1, 6: 7.8, 7: 13.5, 8: 12.5, 9: 6.8, 10: 2.0 };

// Map marker color scale (peak moths/trap)
const COLOR_SCALE = [
  { max: 1.5,  hex: '#78C66A', cls: 'low'  },
  { max: 3.0,  hex: '#E8C547', cls: 'med'  },
  { max: 5.0,  hex: '#E88C47', cls: 'med'  },
  { max: 10.0, hex: '#E84747', cls: 'high' },
  { max: Infinity, hex: '#8B0000', cls: 'high' },
];

// ── State ─────────────────────────────────────────────────────────────────
let allTraps     = [];
let leafletMap   = null;
let markerGroup  = null;
let chartMode    = 'weekly';    // 'weekly' | 'rolling'
let trapDetailCharts = [];
let mainChart    = null;
let ddChart      = null;
let heatLayer    = null;
let mapViewMode  = 'heat';   // 'heat' | 'dots'
const sparklineCharts = {};

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  allTraps = await loadTrapData();
  window.allTraps = allTraps; // expose for report.js + Excel upload
  populateWeekSelect();
  renderDashboardStats();
  renderMainChart();
  renderRegionCards();
  initMap();
  updateMapData();
  initDegreeDayChart();
});

// ═════════════════════════════════════════════════════════════════════════
// HELPER UTILITIES
// ═════════════════════════════════════════════════════════════════════════

function trapPeak(trap) {
  return Math.max(...trap.weeks.map(w => w.count), 0);
}

function trapAtWeek(trap, weekDate) {
  const wk = trap.weeks.find(w => w.date === weekDate);
  return wk ? wk.count : 0;
}

function regionTraps(regionId) {
  return allTraps.filter(t => t.region === regionId);
}

function regionWeeklyAvg(regionId, weekDate) {
  const traps = regionTraps(regionId);
  if (!traps.length) return 0;
  const sum = traps.reduce((s, t) => s + trapAtWeek(t, weekDate), 0);
  return sum / traps.length;
}

function regionPeakAvg(regionId) {
  const traps = regionTraps(regionId);
  if (!traps.length || !SEASON_WEEKS.length) return 0;
  const weekPeaks = SEASON_WEEKS.map(w => regionWeeklyAvg(regionId, w));
  return Math.max(...weekPeaks, 0);
}

function colorForCount(count) {
  return COLOR_SCALE.find(c => count <= c.max) ?? COLOR_SCALE[COLOR_SCALE.length - 1];
}

function fmtCount(n) {
  return n === Math.round(n) ? n.toString() : n.toFixed(1);
}

function fmtDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Returns [lat, lon] offsets for N traps clustered at one point.
// rLat in degrees; rLon scaled to appear round at ~lat 45°.
function clusterLatLonOffsets(n, rLat) {
  if (n <= 1) return [[0, 0]];
  const rLon = rLat * 1.41;
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    return [Math.cos(angle) * rLat, Math.sin(angle) * rLon];
  });
}

function regionMeta(id) {
  return REGIONS.find(r => r.id === id) ?? { color: '#888', name: id };
}

// ═════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═════════════════════════════════════════════════════════════════════════

function renderDashboardStats() {
  if (!allTraps.length || !SEASON_WEEKS.length) {
    setText('stat-below',  '—');
    setText('stat-above',  '—');
    setText('stat-avg',    '—');
    setText('stat-max',    '—');
    setText('hstat-traps', '0');
    setText('hstat-peak',  '—');
    const banner = document.getElementById('data-source-label');
    if (banner) banner.textContent = 'No data loaded — use "Upload Scout Data" above to import your Excel file';
    return;
  }

  const allCounts = allTraps.flatMap(t => t.weeks.map(w => w.count));
  const peakCount = Math.max(...allCounts, 0);

  const aboveCount = allTraps.filter(t => t.weeks.some(w => w.count >= THRESHOLD_SINGLE)).length;
  const belowCount = allTraps.length - aboveCount;

  const peakWeekAvgs = SEASON_WEEKS.map(wk => {
    const s = allTraps.reduce((a, t) => a + trapAtWeek(t, wk), 0);
    return s / allTraps.length;
  });
  const seasonPeakAvg = Math.max(...peakWeekAvgs, 0);
  const peakWkIdx     = peakWeekAvgs.indexOf(seasonPeakAvg);

  setText('stat-below',  belowCount);
  setText('stat-above',  aboveCount);
  setText('stat-avg',    fmtCount(seasonPeakAvg) + '/trap/wk');
  setText('stat-max',    fmtCount(peakCount) + ' moths');
  setText('hstat-traps', allTraps.length);
  setText('hstat-peak',  peakWkIdx >= 0 ? fmtDate(SEASON_WEEKS[peakWkIdx]) : '—');

  const banner = document.getElementById('data-source-label');
  if (banner) {
    banner.textContent = `${allTraps.length} trap stations · Willamette Valley · Donald Valley Agronomics scouting network`;
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN CHART — regional weekly averages
// ═════════════════════════════════════════════════════════════════════════

function rollingSum(data, win = 3) {
  return data.map((_, i) => {
    const slice = data.slice(Math.max(0, i - win + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0);
  });
}

window.setChartMode = function(mode) {
  chartMode = mode;
  document.getElementById('btn-weekly').classList.toggle('active', mode === 'weekly');
  document.getElementById('btn-rolling').classList.toggle('active', mode === 'rolling');
  if (mainChart) { mainChart.destroy(); mainChart = null; }
  renderMainChart();
};

function renderMainChart() {
  const ctx = document.getElementById('main-chart');
  if (!ctx) return;

  const labels = SEASON_WEEKS.map(fmtDate);
  const isSum  = chartMode === 'rolling';

  const getRegionData = (regionId) => {
    const weekly = SEASON_WEEKS.map(w => regionWeeklyAvg(regionId, w));
    return isSum ? rollingSum(weekly) : weekly;
  };

  const datasets = REGIONS.map(region => ({
    label:            region.name,
    data:             getRegionData(region.id),
    borderColor:      region.color,
    backgroundColor:  region.color + '18',
    borderWidth:      2.5,
    pointRadius:      3,
    pointHoverRadius: 5,
    fill:             false,
    tension:          0.35,
  }));

  mainChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend:  { display: false },
        tooltip: {
          callbacks: {
            label: ctx => isSum
              ? ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} moths/trap (3-wk sum)`
              : ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} moths/trap/wk`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { size: 11 }, maxRotation: 35 },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: isSum ? 'Moths / trap (3-week sum)' : 'Avg moths / trap / week', font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: { font: { size: 11 } },
        },
      },
    },
  });

  // Build legend
  const legendEl = document.getElementById('main-legend');
  if (legendEl) {
    legendEl.innerHTML = REGIONS.map(r =>
      `<span class="legend-item">
        <span class="legend-dot" style="background:${r.color}"></span>
        ${r.name}
      </span>`
    ).join('');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// REGION CARDS
// ═════════════════════════════════════════════════════════════════════════

function renderRegionCards() {
  const grid = document.getElementById('region-grid');
  if (!grid) return;

  grid.innerHTML = '';

  if (!SEASON_WEEKS.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--text-light);font-size:0.9rem;">No trap data loaded yet — upload your Excel scout file above to populate the dashboard.</div>';
    return;
  }

  for (const region of REGIONS) {
    const traps      = regionTraps(region.id);
    const latestWk   = SEASON_WEEKS[SEASON_WEEKS.length - 1];
    const latestAvg  = regionWeeklyAvg(region.id, latestWk);
    const trapsZero  = traps.filter(t => trapAtWeek(t, latestWk) === 0).length;
    const trapsOver5 = traps.filter(t => trapAtWeek(t, latestWk) >= THRESHOLD_SINGLE).length;

    const badgeClass = trapsOver5 > 0 ? 'alert' : 'ok';
    const badgeText  = trapsOver5 > 0 ? 'Action Level Reached' : 'Below Threshold';

    const card = document.createElement('div');
    card.className = 'region-card';
    card.innerHTML = `
      <div class="region-card-header">
        <div class="region-name-row">
          <span class="region-color-dot" style="background:${region.color}"></span>
          <span class="region-name">${region.name}</span>
        </div>
        <span class="region-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="region-stats-row">
        <div class="region-stat">
          <strong>${fmtCount(latestAvg)}</strong>
          This week avg
        </div>
        <div class="region-stat">
          <strong>${trapsZero}</strong>
          Traps with 0
        </div>
        <div class="region-stat">
          <strong style="color:${trapsOver5 > 0 ? '#C0392B' : 'inherit'}">${trapsOver5}</strong>
          Traps over 5
        </div>
        <div class="region-stat">
          <strong>${traps.length}</strong>
          Total traps
        </div>
      </div>
      <canvas id="spark-${region.id}" class="region-sparkline"></canvas>
    `;
    card.addEventListener('click', () => highlightRegionOnMap(region.id));
    grid.appendChild(card);

    renderSparkline(`spark-${region.id}`, region);
  }
}

function renderSparkline(canvasId, region) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const data = SEASON_WEEKS.map(w => regionWeeklyAvg(region.id, w));

  if (sparklineCharts[canvasId]) sparklineCharts[canvasId].destroy();

  sparklineCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: SEASON_WEEKS.map(fmtDate),
      datasets: [{
        data,
        borderColor:     region.color,
        backgroundColor: region.color + '22',
        borderWidth:     2,
        pointRadius:     0,
        fill:            true,
        tension:         0.4,
      }],
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend:     { display: false },
        tooltip:    { enabled: false },
      },
      scales: {
        x: { display: false },
        y: { display: false, beginAtZero: true },
      },
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════
// MAP
// ═════════════════════════════════════════════════════════════════════════

function initMap() {
  leafletMap = L.map('trap-map', { zoomControl: true }).setView([45.15, -122.95], 10);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · © <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(leafletMap);

  markerGroup = L.layerGroup().addTo(leafletMap);
}

window.updateMapData = function() {
  const selectEl  = document.getElementById('map-week-select');
  const weekValue = selectEl ? selectEl.value : 'peak';

  markerGroup.clearLayers();
  if (heatLayer) { leafletMap.removeLayer(heatLayer); heatLayer = null; }

  const getCount = trap =>
    weekValue === 'peak' ? trapPeak(trap) : trapAtWeek(trap, weekValue);

  if (mapViewMode === 'heat') {
    const pts = allTraps.filter(t => t.lat && t.lon);
    if (!pts.length) return;
    const maxVal = Math.max(...pts.map(getCount), 1);
    const points = pts.map(t => [t.lat, t.lon, Math.max(0.04, getCount(t) / maxVal)]);
    heatLayer = L.heatLayer(points, {
      radius:  55,
      blur:    40,
      max:     1,
      minOpacity: 0.25,
      gradient: {
        0.0:  '#A8D9B5',
        0.25: '#78C66A',
        0.55: '#E8C547',
        0.78: '#E84747',
        1.0:  '#8B0000',
      },
    }).addTo(leafletMap);
    return;
  }

  // Dots mode — cluster-spread individual markers
  const locationGroups = new Map();
  for (const trap of allTraps) {
    const key = `${trap.lat.toFixed(6)},${trap.lon.toFixed(6)}`;
    if (!locationGroups.has(key)) locationGroups.set(key, []);
    locationGroups.get(key).push(trap);
  }

  for (const trapsAtLoc of locationGroups.values()) {
    const n       = trapsAtLoc.length;
    const offsets = clusterLatLonOffsets(n, 0.0015);

    trapsAtLoc.forEach((trap, i) => {
      const lat   = trap.lat + offsets[i][0];
      const lon   = trap.lon + offsets[i][1];
      const count = getCount(trap);
      const col   = colorForCount(count);

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:12px; height:12px; border-radius:50%;
          background:${col.hex}; border:2px solid white;
          box-shadow:0 1px 4px rgba(0,0,0,0.3);
          transition: transform .1s;
        "></div>`,
        iconSize:   [12, 12],
        iconAnchor: [6, 6],
      });

      const clusterNote = n > 1 ? ` (${i + 1}/${n} at this location)` : '';
      const marker = L.marker([lat, lon], { icon })
        .on('click', () => openLocationDetail([trap]));

      marker.bindPopup(`
        <div class="popup-trap-id">${trap.id}${clusterNote}</div>
        <div class="popup-count ${col.cls}">${fmtCount(count)} moths</div>
        <div class="popup-meta">${trap.regionName} · ${trap.grower}</div>
        <div class="popup-meta" style="margin-top:4px; font-size:0.75rem; color:#888">
          Click for full season data
        </div>
      `);

      markerGroup.addLayer(marker);
    });
  }
};

window.setMapView = function(mode) {
  mapViewMode = mode;
  document.getElementById('btn-heat').classList.toggle('active', mode === 'heat');
  document.getElementById('btn-dots').classList.toggle('active', mode === 'dots');
  const desc = document.getElementById('map-section-desc');
  if (desc) {
    desc.innerHTML = mode === 'heat'
      ? 'Intensity map shows pest pressure by area without revealing individual farm locations. Switch to Trap Dots for full station detail.'
      : 'Each marker is one trap station. Color indicates weekly count. Click any marker for full catch history.';
  }
  if (mode === 'heat') closeTrapDetail();
  updateMapData();
};

function populateWeekSelect() {
  const sel = document.getElementById('map-week-select');
  if (!sel) return;
  SEASON_WEEKS.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w;
    opt.textContent = `Week of ${fmtDate(w)}`;
    sel.appendChild(opt);
  });
  // Default to the most recent week
  if (SEASON_WEEKS.length) sel.value = SEASON_WEEKS[SEASON_WEEKS.length - 1];
}

window.highlightRegionOnMap = function(regionId) {
  if (!leafletMap) return;
  const meta = regionMeta(regionId);
  leafletMap.setView([meta.lat, meta.lon], 12, { animate: true, duration: 0.8 });
  document.getElementById('heatmap').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── Location detail panel — shows all traps at a shared point ────────────
function openLocationDetail(trapsAtLoc) {
  const panel = document.getElementById('trap-detail');
  if (!panel) return;

  // Destroy any existing charts
  trapDetailCharts.forEach(c => c && c.destroy());
  trapDetailCharts = [];

  const first  = trapsAtLoc[0];
  const multi  = trapsAtLoc.length > 1;

  document.getElementById('td-region').textContent = first.regionName;
  document.getElementById('td-coords').textContent =
    `${first.lat.toFixed(4)}°N, ${Math.abs(first.lon).toFixed(4)}°W` +
    (multi ? ` · ${trapsAtLoc.length} traps at this location` : ` · ${first.grower}`);

  const container = document.getElementById('td-traps-container');
  container.innerHTML = '';

  trapsAtLoc.forEach((trap, idx) => {
    const canvasId = `td-chart-${idx}`;
    const label    = [trap.id, trap.trapName, trap.grower].filter(Boolean).join(' — ');

    const section = document.createElement('div');
    section.className = 'td-trap-section';
    section.innerHTML = `
      <div class="td-trap-label">${label}</div>
      <div class="chart-wrap" style="max-height:160px">
        <canvas id="${canvasId}" height="70"></canvas>
      </div>
    `;
    container.appendChild(section);

    const data   = trap.weeks.map(w => w.count);
    const labels = trap.weeks.map(w => fmtDate(w.date));
    const col    = regionMeta(trap.region).color;

    const chart = new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label:           'Moths / week',
          data,
          backgroundColor: data.map(v => v >= THRESHOLD_SINGLE ? '#E84747CC' : col + 'CC'),
          borderRadius:    4,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              thr: {
                type: 'line', yMin: THRESHOLD_SINGLE, yMax: THRESHOLD_SINGLE,
                borderColor: '#C0392B', borderWidth: 1.5, borderDash: [5, 4],
                label: {
                  display: true, content: 'Action threshold (5)',
                  position: 'start', backgroundColor: '#C0392B',
                  color: 'white', font: { size: 10 }, padding: { x: 6, y: 2 },
                },
              },
            },
          },
        },
        scales: {
          x: { ticks: { font: { size: 10 }, maxRotation: 35 } },
          y: { beginAtZero: true, ticks: { font: { size: 10 } }, title: { display: true, text: 'Moths', font: { size: 10 } } },
        },
      },
    });
    trapDetailCharts.push(chart);
  });

  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.closeTrapDetail = function() {
  const panel = document.getElementById('trap-detail');
  if (panel) panel.style.display = 'none';
  trapDetailCharts.forEach(c => c && c.destroy());
  trapDetailCharts = [];
};

// Full dashboard refresh — called after Excel upload so chart canvases are
// properly destroyed before being recreated with new data.
window.refreshDashboard = function() {
  if (mainChart) { mainChart.destroy(); mainChart = null; }
  trapDetailCharts.forEach(c => c && c.destroy());
  trapDetailCharts = [];
  if (heatLayer && leafletMap) { leafletMap.removeLayer(heatLayer); heatLayer = null; }
  const detailPanel = document.getElementById('trap-detail');
  if (detailPanel) detailPanel.style.display = 'none';
  Object.keys(sparklineCharts).forEach(k => {
    if (sparklineCharts[k]) sparklineCharts[k].destroy();
    delete sparklineCharts[k];
  });

  // Re-populate week selector
  const sel = document.getElementById('map-week-select');
  if (sel) {
    while (sel.options.length > 1) sel.remove(1);
    populateWeekSelect();
  }

  renderDashboardStats();
  renderMainChart();
  renderRegionCards();
  updateMapData();
};

// ═════════════════════════════════════════════════════════════════════════
// DEGREE DAY MODEL
// ═════════════════════════════════════════════════════════════════════════

async function initDegreeDayChart() {
  const year       = new Date().getFullYear();
  const biofixDate = `${year}-${DD_BIOFIX}`;
  const today      = new Date();
  const todayStr   = today.toISOString().split('T')[0];

  let actual   = [];   // { date, cumDD } from live API up to today
  let dataNote = '';

  try {
    actual = await fetchOpenMeteoDD(biofixDate, todayStr);
    dataNote = `Live data through ${fmtDate(todayStr)} · ARAO Aurora, OR`;
    document.getElementById('dd-source-badge').textContent = 'Live · Open-Meteo';
  } catch (e) {
    console.warn('Degree day fetch failed:', e.message);
    dataNote = 'Historical average projection — live data unavailable';
    document.getElementById('dd-source-badge').textContent = 'Est. · Historical avg';
  }

  // Build full-season projection: April 1 – Oct 31
  const projected     = buildSeasonProjection(biofixDate, actual);
  const typicalSeason = buildTypicalSeason(year);

  // Expose for report generator
  window._ddActual    = actual;
  window._ddProjected = projected;
  window._ddTypical   = typicalSeason;

  renderDDChart(actual, projected, biofixDate, typicalSeason);
  updateDDStatusCard(actual, projected);
  document.getElementById('dd-chart-title').textContent =
    `${year} Degree Day Accumulation — ${dataNote}`;
}

// Fetch daily Tmax/Tmin from Open-Meteo historical archive, return cumDD array
async function fetchOpenMeteoDD(startDate, endDate) {
  // Ensure end date is at most yesterday (archive lags 1-2 days)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 2);
  const safeEnd = yesterday.toISOString().split('T')[0];
  const end     = endDate < safeEnd ? endDate : safeEnd;

  const url = `https://archive-api.open-meteo.com/v1/archive`
    + `?latitude=${AURORA_LAT}&longitude=${AURORA_LON}`
    + `&start_date=${startDate}&end_date=${end}`
    + `&daily=temperature_2m_max,temperature_2m_min`
    + `&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json.daily?.time) throw new Error('No daily data in response');

  let cumDD = 0;
  return json.daily.time.map((date, i) => {
    const tmax = json.daily.temperature_2m_max[i] ?? 60;
    const tmin = json.daily.temperature_2m_min[i] ?? 40;
    const dd   = Math.max((tmax + tmin) / 2 - DD_BASE, 0);
    cumDD += dd;
    return { date, cumDD: parseFloat(cumDD.toFixed(1)) };
  });
}

// Build typical-season curve using only historical monthly DD averages
function buildTypicalSeason(year) {
  const biofixDate = `${year}-04-01`;
  const endDate    = `${year}-10-31`;
  const result = [];
  let cumDD = 0;
  const cur = new Date(biofixDate + 'T12:00:00');
  while (cur.toISOString().split('T')[0] <= endDate) {
    const month = cur.getMonth() + 1;
    cumDD += HIST_MONTHLY_DD[month] ?? 0;
    result.push({ date: cur.toISOString().split('T')[0], cumDD: parseFloat(cumDD.toFixed(1)) });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// Build full-season date series using actual data + historical-avg projection
function buildSeasonProjection(biofixDate, actual) {
  const year     = parseInt(biofixDate.split('-')[0]);
  const endDate  = `${year}-10-31`;
  const actualMap = Object.fromEntries(actual.map(d => [d.date, d.cumDD]));

  let lastDD   = actual.length ? actual[actual.length - 1].cumDD : 0;
  let lastDate = actual.length ? actual[actual.length - 1].date  : biofixDate;

  const all = [...actual];
  const cur = new Date(lastDate + 'T12:00:00');
  cur.setDate(cur.getDate() + 1);

  while (cur.toISOString().split('T')[0] <= endDate) {
    const ds     = cur.toISOString().split('T')[0];
    const month  = cur.getMonth() + 1;
    const avgDD  = HIST_MONTHLY_DD[month] ?? 0;
    lastDD      += avgDD;
    all.push({ date: ds, cumDD: parseFloat(lastDD.toFixed(1)), projected: true });
    cur.setDate(cur.getDate() + 1);
  }
  return all;
}

function renderDDChart(actual, allPoints, biofixDate, typicalSeason = []) {
  const ctx = document.getElementById('dd-chart');
  if (!ctx) return;

  const labels    = allPoints.map(d => fmtDate(d.date));
  const actualEnd = actual.length;

  const actualData    = allPoints.map((d, i) => i < actualEnd ? d.cumDD : null);
  const projectedData = allPoints.map((d, i) => i >= actualEnd - 1 ? d.cumDD : null);

  // Map typical season data to the same date indices as allPoints
  const typicalMap = Object.fromEntries(typicalSeason.map(d => [d.date, d.cumDD]));
  const typicalData = allPoints.map(d => typicalMap[d.date] ?? null);

  const today = new Date().toISOString().split('T')[0];
  const todayIdx = allPoints.findIndex(d => d.date >= today);

  if (ddChart) ddChart.destroy();

  ddChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label:           'Actual DD',
          data:            actualData,
          borderColor:     '#2B6E3B',
          backgroundColor: 'rgba(43,110,59,0.08)',
          borderWidth:     2.5,
          pointRadius:     0,
          fill:            true,
          tension:         0.2,
          spanGaps:        false,
        },
        {
          label:           'Projected DD',
          data:            projectedData,
          borderColor:     '#2B6E3B',
          borderDash:      [6, 4],
          borderWidth:     2,
          pointRadius:     0,
          fill:            false,
          tension:         0.2,
          spanGaps:        false,
        },
        {
          label:           'Typical Season (Hist. Avg)',
          data:            typicalData,
          borderColor:     '#9E9E9E',
          borderDash:      [4, 6],
          borderWidth:     1.5,
          pointRadius:     0,
          fill:            false,
          tension:         0.2,
          spanGaps:        false,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y.toFixed(0)} DD accumulated`,
          },
        },
        annotation: {
          annotations: {
            ff: ddThreshLine(allPoints, DD_FIRST_FLIGHT, '#E8A000', 'First Flight (610 DD)'),
            eh: ddThreshLine(allPoints, DD_EGG_HATCH,   '#D44000', 'Peak Egg Hatch (1,023 DD)'),

            pa: ddThreshLine(allPoints, DD_PEAK_ADULT,  '#8B2FC9', 'Peak Adult (1,188 DD)'),
            ...(todayIdx > 0 ? {
              now: {
                type: 'line',
                xMin: todayIdx, xMax: todayIdx,
                borderColor: '#1A3D23',
                borderWidth: 1.5,
                borderDash: [3, 3],
                label: {
                  display: true, content: 'Today',
                  position: 'start', backgroundColor: '#1A3D23',
                  color: 'white', font: { size: 10 }, padding: { x: 5, y: 2 },
                },
              },
            } : {}),
          },
        },
      },
      scales: {
        x: {
          ticks: {
            font: { size: 10 },
            maxTicksLimit: 12,
            maxRotation: 30,
          },
          grid: { color: 'rgba(0,0,0,0.04)' },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Cumulative Degree Days (base 50°F)', font: { size: 11 } },
          grid:  { color: 'rgba(0,0,0,0.06)' },
          ticks: { font: { size: 11 } },
        },
      },
    },
  });
}

function ddThreshLine(points, ddVal, color, label) {
  const idx = points.findIndex(d => d.cumDD >= ddVal);
  if (idx < 0) return null;
  return {
    type: 'line',
    yMin: ddVal, yMax: ddVal,
    borderColor: color,
    borderWidth: 1.5,
    borderDash: [7, 4],
    label: {
      display: true,
      content: label,
      position: 'start',
      backgroundColor: color,
      color: 'white',
      font: { size: 9, weight: '600' },
      padding: { x: 5, y: 2 },
    },
  };
}

function updateDDStatusCard(actual, allPoints) {
  const currentDD = actual.length ? actual[actual.length - 1].cumDD : 0;
  const maxDD     = allPoints.length ? allPoints[allPoints.length - 1].cumDD : DD_PEAK_ADULT + 200;

  let icon, title, sub, progressTarget;

  if (currentDD < DD_FIRST_FLIGHT) {
    icon = '🌱';
    title = 'Pre-Flight Season';
    sub  = `${fmtCount(currentDD)} DD accumulated — first flight expected at ${DD_FIRST_FLIGHT} DD`;
    progressTarget = DD_FIRST_FLIGHT;
  } else if (currentDD < DD_EGG_HATCH) {
    icon = '🦋';
    title = 'Flight Season Active';
    sub  = `${fmtCount(currentDD)} DD — monitor traps weekly. Spray window opens at ${DD_EGG_HATCH} DD`;
    progressTarget = DD_EGG_HATCH;
  } else if (currentDD < DD_PEAK_ADULT) {
    icon = '⚠️';
    title = 'Spray Window Open';
    sub  = `${fmtCount(currentDD)} DD — peak egg hatch reached. Time sprays to target larvae before nut entry.`;
    progressTarget = DD_PEAK_ADULT;
  } else {
    icon = '📉';
    title = 'Peak Flight Passed';
    sub  = `${fmtCount(currentDD)} DD accumulated. Second generation possible. Continue monitoring.`;
    progressTarget = maxDD;
  }

  const pct = Math.min((currentDD / progressTarget) * 100, 100).toFixed(1);

  document.getElementById('dd-status-icon').textContent  = icon;
  document.getElementById('dd-status-title').textContent = title;
  document.getElementById('dd-status-sub').textContent   = sub;
  document.getElementById('dd-progress-bar').style.width = pct + '%';
  document.getElementById('dd-progress-label').textContent =
    `${fmtCount(currentDD)} of ${progressTarget} DD target (${pct}%)`;
  document.getElementById('hstat-dd').textContent = Math.round(currentDD) + ' DD';

  // Expose for report generator
  window._currentDD = currentDD;
}
