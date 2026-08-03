/* ═══════════════════════════════════════════════════════
   data.js — Trap data definitions and Excel upload parser
   ═══════════════════════════════════════════════════════ */

// ── Region definitions ────────────────────────────────────────────────────────
const REGIONS = [
  { id: '1', name: 'Zone 1', lat: 45.215, lon: -122.800, spread: 0.07, color: '#2196F3' },
  { id: '2', name: 'Zone 2', lat: 45.305, lon: -123.005, spread: 0.10, color: '#E53935' },
  { id: '3', name: 'Zone 3', lat: 45.225, lon: -122.835, spread: 0.065, color: '#43A047' },
  { id: '4', name: 'Zone 4', lat: 44.965, lon: -123.020, spread: 0.09, color: '#FB8C00' },
  { id: '5', name: 'Zone 5', lat: 45.390, lon: -122.910, spread: 0.08, color: '#8E24AA' },
];

// Populated from Excel uploads; starts empty
const SEASON_WEEKS = [];

// ── Primary loader — fetches the shared upload from the server so every
//    visitor sees the same data; falls back to localStorage if offline ──────
async function loadTrapData() {
  try {
    const resp = await fetch('/api/trap-data', { cache: 'no-store' });
    if (resp.ok) {
      const { traps, weeks } = await resp.json();
      if (traps && traps.length && weeks && weeks.length) {
        SEASON_WEEKS.splice(0, SEASON_WEEKS.length, ...weeks);
        try { localStorage.setItem('dva_trap_data', JSON.stringify({ traps, weeks })); } catch (_) {}
        return traps;
      }
    }
  } catch (_) {}

  // Offline / server unreachable — fall back to this device's local cache
  try {
    const saved = localStorage.getItem('dva_trap_data');
    if (saved) {
      const { traps, weeks } = JSON.parse(saved);
      if (traps && traps.length && weeks && weeks.length) {
        SEASON_WEEKS.splice(0, SEASON_WEEKS.length, ...weeks);
        return traps;
      }
    }
  } catch (_) {}
  return [];
}

// ── Excel serial date → ISO string (YYYY-MM-DD) ───────────────────────────────
function excelSerialToISO(serial) {
  // Excel erroneously treats 1900 as a leap year; offset accounts for that bug
  const msPerDay = 86400000;
  const epoch    = new Date(Date.UTC(1899, 11, 30)); // Dec 30 1899
  const date     = new Date(epoch.getTime() + serial * msPerDay);
  return date.toISOString().split('T')[0];
}

// ── Parse a header cell value as a date, return ISO string or null ───────────
function parseHeaderDate(val) {
  if (val === null || val === undefined || val === '') return null;

  const n = Number(val);
  // Excel date serials: roughly 2000-01-01 (36526) to 2100-01-01 (73050)
  if (!isNaN(n) && n > 36000 && n < 80000) {
    return excelSerialToISO(n);
  }

  // String date formats
  const str = String(val).trim();

  // Generic week labels like "Week 1", "Week 2" — pass through as-is
  if (/^week\s*\d+$/i.test(str)) return str;

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [m, d, y] = str.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const parsed = Date.parse(str);
  if (!isNaN(parsed)) return new Date(parsed).toISOString().split('T')[0];

  return null;
}

// ── Main Excel upload handler ─────────────────────────────────────────────────
// Expects Valley Ag scout format:
//   Trap Number | Farm Name | Trap Name | Zone | Location | <date> [| <date> ...]
//   Location = "lat, lon" as a single cell
//   Date column headers = Excel date serial numbers or date strings
//
// On success: replaces allTraps and SEASON_WEEKS, re-renders dashboard.

window.handleExcelUpload = async function(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const statusEl = document.getElementById('upload-status');
  statusEl.className    = 'upload-status';
  statusEl.textContent  = 'Parsing Excel file…';
  statusEl.style.display = 'inline-block';

  try {
    // Load SheetJS on demand
    if (!window.XLSX) {
      await new Promise((resolve, reject) => {
        const s   = document.createElement('script');
        s.src     = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        s.onload  = resolve;
        s.onerror = () => reject(new Error('Failed to load XLSX library'));
        document.head.appendChild(s);
      });
    }

    const buf     = await file.arrayBuffer();
    const wb      = XLSX.read(buf, { type: 'array' });
    const ws      = wb.Sheets[wb.SheetNames[0]];

    // Read as raw array-of-arrays so we can inspect header cells directly
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rawRows.length < 2) throw new Error('Sheet appears empty (fewer than 2 rows)');

    const headers  = rawRows[0];
    const dataRows = rawRows.slice(1).filter(r => r.some(c => c !== '' && c !== null));

    if (!dataRows.length) throw new Error('No data rows found below the header row');

    // ── Identify known columns by name ───────────────────────────────────────
    function findCol(...candidates) {
      for (const name of candidates) {
        const idx = headers.findIndex(
          h => String(h).trim().toLowerCase() === name.toLowerCase()
        );
        if (idx >= 0) return idx;
      }
      // fallback: partial match
      for (const name of candidates) {
        const idx = headers.findIndex(
          h => String(h).trim().toLowerCase().includes(name.toLowerCase())
        );
        if (idx >= 0) return idx;
      }
      return -1;
    }

    const trapNumCol  = findCol('Trap Number', 'Trap No', 'TrapNum', 'Trap #', 'trap_id', 'id');
    const farmNameCol = findCol('Farm Name', 'Farm', 'Grower', 'Owner', 'Customer');
    const trapNameCol = findCol('Trap Name', 'TrapName', 'Trap');
    const zoneCol     = findCol('Zone', 'Region', 'District', 'Zone #');
    const locationCol = findCol('Location', 'Coordinates', 'Lat/Lon', 'GPS');
    const latCol      = findCol('Latitude', 'Lat');
    const lonCol      = findCol('Longitude', 'Lon', 'Long');

    // ── Find date columns (numeric or date-string headers not matched above) ──
    const knownCols = new Set(
      [trapNumCol, farmNameCol, trapNameCol, zoneCol, locationCol, latCol, lonCol]
        .filter(c => c >= 0)
    );

    const dateCols = [];
    headers.forEach((h, i) => {
      if (knownCols.has(i)) return;
      const isoDate = parseHeaderDate(h);
      if (isoDate) dateCols.push({ colIdx: i, date: isoDate });
    });

    if (dateCols.length === 0) {
      throw new Error(
        `No date columns found. Expected column headers to be dates (e.g. 5/26/2026) or Excel date serial numbers.\n` +
        `Found headers: ${headers.map(String).join(', ')}`
      );
    }

    // ── Parse each data row into a trap object ────────────────────────────────
    const traps = [];

    for (let ri = 0; ri < dataRows.length; ri++) {
      const row = dataRows[ri];

      const trapNum  = trapNumCol  >= 0 ? String(row[trapNumCol] ?? '').trim()  : String(ri + 1);
      const farmName = farmNameCol >= 0 ? String(row[farmNameCol] ?? '').trim() : '';
      const trapName = trapNameCol >= 0 ? String(row[trapNameCol] ?? '').trim() : '';
      const zone     = zoneCol     >= 0 ? String(row[zoneCol]     ?? '').trim() : '3';

      if (!trapNum && !farmName) continue; // skip blank rows

      // Parse location
      let lat = 0, lon = 0;
      if (locationCol >= 0) {
        const locStr = String(row[locationCol] ?? '').trim();
        const parts  = locStr.split(/,\s*/);
        if (parts.length >= 2) {
          lat = parseFloat(parts[0]);
          lon = parseFloat(parts[1]);
        }
      } else {
        lat = latCol >= 0 ? parseFloat(row[latCol]) || 0 : 0;
        lon = lonCol >= 0 ? parseFloat(row[lonCol]) || 0 : 0;
      }

      // Build week entries
      const weeks = dateCols.map(({ colIdx, date }) => ({
        date,
        count: parseFloat(row[colIdx]) || 0,
      }));

      const zoneId = zone || '3';
      const region = REGIONS.find(r => r.id === zoneId);
      const id     = `Z${zoneId}-T${trapNum.padStart(2, '0')}`;

      traps.push({
        id,
        region:     zoneId,
        regionName: region ? region.name : `Zone ${zoneId}`,
        grower:     farmName,
        trapName,
        lat:        isNaN(lat) ? 0 : lat,
        lon:        isNaN(lon) ? 0 : lon,
        weeks,
      });
    }

    if (!traps.length) throw new Error('Parsed 0 traps — check that the sheet has data rows');

    // ── Update SEASON_WEEKS (replace in-place) ────────────────────────────────
    const newDates = [...new Set(dateCols.map(c => c.date))].sort();
    SEASON_WEEKS.splice(0, SEASON_WEEKS.length, ...newDates);

    // ── Replace allTraps entirely ─────────────────────────────────────────────
    allTraps.splice(0, allTraps.length, ...traps);
    window.allTraps = allTraps;

    // ── Persist locally so this device has a fast cache ───────────────────────
    try {
      localStorage.setItem('dva_trap_data', JSON.stringify({
        traps: allTraps,
        weeks: SEASON_WEEKS,
      }));
    } catch (_) {}

    // ── Save to the server so every visitor sees this upload ──────────────────
    let savedForAll = false;
    try {
      const saveResp = await fetch('/api/trap-data', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ traps: allTraps, weeks: SEASON_WEEKS }),
      });
      savedForAll = saveResp.ok;
    } catch (_) {}

    // ── Re-render dashboard (app.js owns chart destruction) ──────────────────
    if (typeof window.refreshDashboard === 'function') {
      window.refreshDashboard();
    }

    statusEl.textContent = savedForAll
      ? `✓ Loaded ${traps.length} traps from "${file.name}" · ${newDates.length} week(s) of data · Saved for all users`
      : `⚠ Loaded ${traps.length} traps locally, but failed to save for other users — check server storage setup`;
    statusEl.className = savedForAll ? 'upload-status success' : 'upload-status error';

  } catch (err) {
    console.error('Excel upload error:', err);
    statusEl.textContent = '✗ ' + err.message;
    statusEl.className   = 'upload-status error';
  }

  inputEl.value = ''; // allow re-uploading the same file
};

// ── Expose globals for app.js and report.js ───────────────────────────────────
window.REGIONS      = REGIONS;
window.SEASON_WEEKS = SEASON_WEEKS;
window.loadTrapData = loadTrapData;
