/* ═══════════════════════════════════════════════════════
   data.js — Real trap data + Google Sheets loader
   ═══════════════════════════════════════════════════════ */

// Paste your published Google Sheet CSV URL here when ready,
// or use the UI in the Resources section to connect it.
window.SHEET_CSV_URL = '';

// ── Region definitions — Willamette Valley hazelnut belt ──────────────────
const REGIONS = [
  { id: '1', name: 'Region 1', lat: 45.215, lon: -122.800, spread: 0.07, color: '#2196F3' },
  { id: '2', name: 'Region 2', lat: 45.305, lon: -123.005, spread: 0.10, color: '#E53935' },
  // Zone 3: real coordinates from Valley Ag scouting network (Donald, OR area)
  { id: '3', name: 'Region 3', lat: 45.225, lon: -122.835, spread: 0.065, color: '#43A047' },
  { id: '4', name: 'Region 4', lat: 44.965, lon: -123.020, spread: 0.09, color: '#FB8C00' },
  { id: '5', name: 'Region 5', lat: 45.390, lon: -122.910, spread: 0.08, color: '#8E24AA' },
];

// 2025 season monitoring weeks from user trap data (May 18 – Aug 10)
const SEASON_WEEKS = [
  '2025-05-18','2025-05-25','2025-06-01','2025-06-08','2025-06-15',
  '2025-06-22','2025-06-29','2025-07-06','2025-07-13','2025-07-20',
  '2025-07-27','2025-08-03','2025-08-10',
];

// ── Seeded PRNG for deterministic lat/lon placement ───────────────────────
function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Assign approximate lat/lon to each trap based on region center + trap index.
// These are plausible locations within the regional cluster; replace with real
// GPS coordinates once available (add lat/lon columns to your Google Sheet).
function assignLatLon(regionId, trapIndex) {
  const region = REGIONS.find(r => r.id === regionId);
  const rng    = lcg(parseInt(regionId) * 1000 + trapIndex);
  const lat    = region.lat + (rng() - 0.5) * 2 * region.spread;
  const lon    = region.lon + (rng() - 0.5) * 2 * region.spread;
  return { lat: parseFloat(lat.toFixed(5)), lon: parseFloat(lon.toFixed(5)) };
}

// ── Real trap data — 45 traps, 5 regions, 13 weeks (2025) ─────────────────
// Raw counts from field tech spreadsheet, week of date listed.
// Columns: trapId, region, [counts per week matching SEASON_WEEKS order]
const RAW_TRAP_COUNTS = [
  //  id  reg   5/18 5/25  6/1  6/8 6/15 6/22 6/29  7/6 7/13 7/20 7/27  8/3 8/10
  [  1, '1',    0,   1,   1,   5,   6,   2,   1,   1,   1,   5,   3,   3,  1 ],
  [  2, '1',    0,   1,   2,   2,   1,   2,   6,   2,   5,   2,   5,   0,  3 ],
  [  3, '1',    0,   1,   1,   7,   1,   3,   5,   1,   2,   5,   2,   4,  1 ],
  [  4, '1',    0,   1,   0,   7,   3,   1,   4,   3,   3,   4,   0,   1,  2 ],
  [  5, '1',    1,   1,   2,  12,   7,   3,   4,   3,   4,   2,   3,   4,  1 ],
  [  6, '1',    0,   1,   3,  11,   5,   0,   2,   0,   5,   3,   5,   2,  2 ],
  [  7, '1',    0,   1,   4,  11,   5,   4,   2,   0,   0,   7,   5,   4,  2 ],
  [  8, '1',    0,   0,   2,  11,   4,   0,   2,   0,   2,   1,   3,   2,  3 ],
  [  9, '2',    0,   1,   1,   9,   1,   1,  10,   1,   1,   1,   0,   0,  0 ],
  [ 10, '2',    0,   1,   0,   9,   5,   0,   4,   1,   4,   4,   3,  11,  3 ],
  [ 11, '2',    1,   2,   4,   3,   2,   0,   1,   3,   4,   3,   1,   2,  1 ],
  [ 12, '2',    0,   1,   0,   6,   5,   3,   2,   3,   5,   5,   4,   0,  0 ],
  [ 13, '2',    0,   1,   3,   2,   6,   3,   5,   2,   5,   3,   3,   3,  2 ],
  [ 14, '2',    0,   1,   2,   7,   7,   0,   1,   1,   3,   5,   5,   0,  3 ],
  [ 15, '2',    0,   0,   0,   9,   2,   1,   1,   1,   5,   2,   3,   1,  2 ],
  [ 16, '2',    0,   1,   0,   6,   3,   4,   5,   3,   5,   0,   2,   4,  0 ],
  [ 17, '3',    0,   1,   1,  11,   2,   4,   1,  20,   2,   5,   2,   4,  3 ],
  [ 18, '3',    0,   1,   2,   7,   2,   3,   6,   0,   3,   4,   3,   2,  0 ],
  [ 19, '3',    0,   1,   3,  10,   4,   2,   4,   2,   1,   5,   3,   2,  2 ],
  [ 20, '3',    0,   1,   4,   2,   6,   2,   2,   2,   4,   2,   1,   2,  1 ],
  [ 21, '3',    0,   3,   2,   3,   2,   1,   1,   1,   5,   2,   0,   0,  3 ],
  [ 22, '3',    0,   1,   4,   1,   5,   0,   1,   0,   3,   1,   3,   0,  2 ],
  [ 23, '3',    0,   0,   1,   4,   3,   4,   1,   3,   4,   2,   0,   1,  2 ],
  [ 24, '3',    0,   1,   3,   7,   7,   1,   2,   1,   5,   1,   1,   2,  2 ],
  [ 25, '3',    1,   1,   1,  12,   6,   1,   6,   0,   5,   4,   4,   3,  0 ],
  [ 26, '4',    0,   2,   1,   7,   4,   0,   3,   0,   1,   4,   2,   2,  3 ],
  [ 27, '4',    0,   1,   1,   3,   0,   1,   1,   0,   3,   2,   2,   2,  1 ],
  [ 28, '4',    0,   1,   1,   9,   0,   2,   5,   0,   1,   4,   4,   6,  3 ],
  [ 29, '4',    0,   1,   4,   4,   1,   1,   3,   0,   2,   4,   3,   3,  0 ],
  [ 30, '4',    0,   3,   1,   1,   1,   3,   3,   3,   0,   2,   2,   2,  0 ],
  [ 31, '4',    0,   1,   2,  10,   5,   1,   6,   2,   0,   9,   3,   3,  1 ],
  [ 32, '4',    0,   0,   3,   9,   0,   3,   5,   3,   4,   5,   2,   3,  1 ],
  [ 33, '4',    0,   1,   1,   8,   1,   2,   2,   1,   2,   2,   2,   4,  3 ],
  [ 34, '5',    0,   1,   3,   6,   0,   2,   4,   3,   1,   5,   3,   2,  2 ],
  [ 35, '5',    0,   0,   2,  10,   0,   3,   4,   1,   2,   3,   5,   3,  0 ],
  [ 36, '5',    0,   1,   4,  12,   7,   4,   2,   0,   2,   2,   2,   1,  3 ],
  [ 37, '5',    0,   1,   3,  10,   6,   0,   3,   0,   4,   4,   2,   3,  0 ],
  [ 38, '5',    1,   1,   4,   6,   6,   4,   4,   2,   3,   1,   3,   3,  0 ],
  [ 39, '5',    0,   1,   1,   4,   1,   3,   5,   0,   1,   3,   1,   0,  3 ],
  [ 40, '5',    0,   1,   1,   7,   7,   3,   4,   0,   2,   7,   5,  13,  0 ],
  [ 41, '5',    0,   1,   4,  11,   2,   0,   4,   0,   1,   1,   1,  12,  0 ],
  [ 42, '5',    1,   3,   4,   5,   1,   3,   2,   1,   0,   0,   0,   9,  0 ],
  [ 43, '5',    0,   1,   3,   8,   7,   2,   3,   2,   0,   0,   5,   1,  0 ],
  [ 44, '5',    0,   1,   3,  12,   7,   4,   3,   2,   1,   4,   5,   4,  1 ],
  [ 45, '5',    7,  12,   0,   0,   6,   4,   2,   3,   3,   4,   3,   0,  1 ],
];

// ── Zone 3 real farm roster (from Valley Ag scouting GPS data) ────────────────
const ZONE3_FARMS = [
  { farm: 'HAENER FARMS INC',        traps: 8  },
  { farm: 'NORTHWEST FLORICULTURE',  traps: 3  },
  { farm: 'DAVID LEAVY',             traps: 5  },
  { farm: 'B DAVIDSON FARMS LLC',    traps: 4  },
  { farm: 'ZACHER DELBERT',          traps: 8  },
  { farm: 'ZACHER RICK C',           traps: 6  },
  { farm: 'A & R SPADA',             traps: 10 },
  { farm: 'KAUFMANN FARMS',          traps: 4  },
  { farm: 'K G FARMS',               traps: 7  },
];

function buildZone3Traps() {
  const region     = REGIONS.find(r => r.id === '3');
  const rng        = lcg(3001);
  const siteMult   = 0.70;
  const traps      = [];
  let   trapIdx    = 0;

  for (const { farm, traps: n } of ZONE3_FARMS) {
    for (let i = 1; i <= n; i++) {
      const lat        = region.lat + (rng() - 0.5) * 2 * region.spread;
      const lon        = region.lon + (rng() - 0.5) * 2 * region.spread;
      const siteFactor = 0.3 + rng() * 1.4;
      const weeks      = SEASON_WEEKS.map((date, wi) => {
        const base  = (FLIGHT_CURVE_200[wi] ?? 0) * siteMult * siteFactor;
        const noise = 0.4 + rng() * 1.2;
        return { date, count: parseFloat(Math.max(0, base * noise).toFixed(1)) };
      });

      traps.push({
        id:         `Z3-${String(trapIdx + 1).padStart(2, '0')}`,
        region:     '3',
        regionName: 'Region 3',
        grower:     farm,
        lat:        parseFloat(lat.toFixed(5)),
        lon:        parseFloat(lon.toFixed(5)),
        weeks,
      });
      trapIdx++;
    }
  }
  return traps;
}

// Build structured trap objects from raw counts
function buildRealTraps() {
  const regionIdx = { '1': 0, '2': 0, '4': 0, '5': 0 };

  const otherZones = RAW_TRAP_COUNTS
    .filter(row => row[1] !== '3')
    .map(row => {
      const [trapNum, regionId, ...counts] = row;
      const idx    = regionIdx[regionId]++;
      const { lat, lon } = assignLatLon(regionId, idx);
      const region = REGIONS.find(r => r.id === regionId);
      return {
        id:         `T-${String(trapNum).padStart(3, '0')}`,
        region:     regionId,
        regionName: region ? region.name : `Region ${regionId}`,
        grower:     '',
        lat,
        lon,
        weeks: SEASON_WEEKS.map((date, i) => ({ date, count: counts[i] ?? 0 })),
      };
    });

  return [...otherZones, ...buildZone3Traps()];
}

// ── Synthetic 200-trap generator (kept for scale testing) ─────────────────
const FLIGHT_CURVE_200 = [
  0.3, 0.7, 1.6, 3.0, 4.5, 6.0, 7.3, 7.0, 5.6, 4.2, 3.4, 2.6, 2.0,
];

function generateDemoTraps() {
  const rng = lcg(42);
  const traps = [];
  const regionMultMap = { '1': 1.05, '2': 1.35, '3': 0.70, '4': 1.10, '5': 0.90 };

  for (const region of REGIONS) {
    const mult = regionMultMap[region.id] ?? 1;
    for (let i = 0; i < 40; i++) {
      const siteFactor = 0.4 + rng() * 1.6;
      const lat = region.lat + (rng() - 0.5) * 2 * region.spread;
      const lon = region.lon + (rng() - 0.5) * 2 * region.spread;

      const weeks = SEASON_WEEKS.map((date, wi) => {
        const base  = (FLIGHT_CURVE_200[wi] ?? 0) * mult * siteFactor;
        const noise = 0.55 + rng() * 0.9;
        return { date, count: Math.max(0, parseFloat((base * noise).toFixed(1))) };
      });

      traps.push({
        id:         `${region.id}-${String(i + 1).padStart(3, '0')}`,
        region:     region.id,
        regionName: region.name,
        grower:     '',
        lat:        parseFloat(lat.toFixed(5)),
        lon:        parseFloat(lon.toFixed(5)),
        weeks,
      });
    }
  }
  return traps;
}

// ── Parse CSV from a published Google Sheet ───────────────────────────────
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',')
    .map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  return lines.slice(1).map(line => {
    const vals = [];
    let inQ = false, cur = '';
    for (const c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

// Transform flat sheet rows (one row per weekly observation) into trap objects.
// Expected columns: trap_id, region, region_name, grower, lat, lon, date, count
function transformSheetData(rows) {
  const map = {};
  for (const row of rows) {
    const id = row.trap_id || row.trapid || row.trap || row.id;
    if (!id) continue;
    if (!map[id]) {
      const regionId = String(row.region || '');
      const region   = REGIONS.find(r => r.id === regionId);
      map[id] = {
        id,
        region:     regionId,
        regionName: row.region_name || row.regionname || (region ? region.name : regionId),
        grower:     row.grower || '',
        lat:        parseFloat(row.lat) || 0,
        lon:        parseFloat(row.lon || row.long || row.longitude) || 0,
        weeks:      [],
      };
    }
    const count = parseFloat(row.count || row.moths || row.catch) || 0;
    const date  = row.date || row.week || row.week_date || '';
    if (date) map[id].weeks.push({ date, count });
  }
  return Object.values(map).map(t => ({
    ...t,
    weeks: t.weeks.sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

// ── Primary loader ─────────────────────────────────────────────────────────
async function loadTrapData() {
  const url = window.SHEET_CSV_URL;
  if (url && url.trim()) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const csv  = await resp.text();
      const rows = parseCSV(csv);
      const traps = transformSheetData(rows);
      if (traps.length > 0) {
        console.info(`Loaded ${traps.length} traps from Google Sheet.`);
        document.getElementById('data-source-label').textContent =
          `Live data: ${traps.length} traps from Google Sheet — `;
        return traps;
      }
      throw new Error('No trap rows found in sheet');
    } catch (e) {
      console.warn('Google Sheet load failed, using real demo data:', e.message);
    }
  }
  return buildRealTraps();
}

// ── Excel Upload ──────────────────────────────────────────────────────────────
// Called when user selects a .xlsx file in the admin strip.
// Expects SheetJS (XLSX) loaded from CDN; loaded on demand.
window.handleExcelUpload = async function(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const statusEl = document.getElementById('upload-status');
  statusEl.textContent = 'Parsing Excel file…';
  statusEl.style.display = 'inline-block';

  try {
    // Load SheetJS on demand
    if (!window.XLSX) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) throw new Error('No data rows found in sheet');

    // Normalise header names → snake_case
    const normalised = rows.map(row => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        out[k.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')] = v;
      }
      return out;
    });

    const parsed = transformSheetData(normalised);
    if (!parsed.length) throw new Error('Could not parse trap data from sheet — check column names');

    // Merge into allTraps: update counts for matching trap IDs, add new traps
    for (const incoming of parsed) {
      const existing = window.allTraps && allTraps.find(t => t.id === incoming.id);
      if (existing) {
        // Merge / append weeks
        for (const wk of incoming.weeks) {
          const idx = existing.weeks.findIndex(w => w.date === wk.date);
          if (idx >= 0) { existing.weeks[idx].count = wk.count; }
          else          { existing.weeks.push(wk); existing.weeks.sort((a,b) => a.date.localeCompare(b.date)); }
        }
      } else if (window.allTraps) {
        allTraps.push(incoming);
      }
    }

    // Re-render dashboard
    if (typeof renderDashboardStats === 'function') renderDashboardStats();
    if (typeof renderMainChart      === 'function') { if (mainChart) { mainChart.destroy(); mainChart = null; } renderMainChart(); }
    if (typeof renderRegionCards    === 'function') renderRegionCards();
    if (typeof updateMapData        === 'function') updateMapData();

    statusEl.textContent  = `✓ Loaded ${parsed.length} traps from "${file.name}"`;
    statusEl.className    = 'upload-status success';
  } catch (err) {
    statusEl.textContent  = '✗ ' + err.message;
    statusEl.className    = 'upload-status error';
    console.error('Excel upload error:', err);
  }

  inputEl.value = ''; // reset so same file can be re-uploaded
};

// ── Connect sheet from UI ─────────────────────────────────────────────────
function connectSheet() {
  const input = document.getElementById('sheet-url-input');
  const url   = input.value.trim();
  if (!url.startsWith('https://docs.google.com/spreadsheets')) {
    alert('Please enter a valid Google Sheets published CSV URL.\n\nIn Google Sheets: File → Share → Publish to web → CSV');
    return;
  }
  window.SHEET_CSV_URL = url;
  localStorage.setItem('dva_sheet_url', url);
  window.location.reload();
}

// Restore saved sheet URL
(function restoreSheetUrl() {
  const saved = localStorage.getItem('dva_sheet_url');
  if (saved) {
    window.SHEET_CSV_URL = saved;
    const input = document.getElementById('sheet-url-input');
    if (input) input.value = saved;
  }
})();

// Expose for app.js
window.REGIONS      = REGIONS;
window.SEASON_WEEKS = SEASON_WEEKS;
window.loadTrapData = loadTrapData;
