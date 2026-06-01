/* ═══════════════════════════════════════════════════════
   report.js — Portrait zone PDF/JPEG report generator
   Canvas 1240×1748 (A4 portrait @ 150 dpi)
   Sections: Header → Stats → Map (OSM) → Trend → GDD → Footer
   ═══════════════════════════════════════════════════════ */

'use strict';

window._currentDD = 0;

const RPT_W   = 1240;
const RPT_H   = 1748;
const RPT_PAD = 20;    // horizontal margin for panels

// ── jsPDF loader ─────────────────────────────────────────────────────────────
let _jsPDFLoaded = false;
function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (_jsPDFLoaded || window.jspdf) { _jsPDFLoaded = true; resolve(); return; }
    const s = document.createElement('script');
    s.src     = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.onload  = () => { _jsPDFLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load jsPDF'));
    document.head.appendChild(s);
  });
}

// ── Public entry points ───────────────────────────────────────────────────────
window.sendAllReports = async function() {
  const btn      = document.getElementById('report-send-btn');
  const statusEl = document.getElementById('report-status');

  btn.disabled           = true;
  statusEl.textContent   = 'Loading PDF library…';
  statusEl.className     = 'report-status';
  statusEl.style.display = 'inline-block';

  try {
    await loadJsPDF();

    const zonesWithData = REGIONS.filter(r =>
      allTraps && allTraps.some(t => t.region === r.id)
    );

    if (!zonesWithData.length) {
      statusEl.textContent = '✗ No trap data loaded — upload your Excel file first';
      statusEl.className   = 'report-status error';
      btn.disabled = false;
      return;
    }

    for (const region of zonesWithData) {
      statusEl.textContent = `Building Zone ${region.id} report (loading map…)`;
      await sendZoneReport(region.id);
    }

    statusEl.textContent = `✓ ${zonesWithData.length} report(s) sent to morgan.curtis@valleyag.com`;
    statusEl.className   = 'report-status success';
  } catch (err) {
    console.error('Report error:', err);
    statusEl.textContent = '✗ ' + err.message;
    statusEl.className   = 'report-status error';
  } finally {
    btn.disabled = false;
  }
};

window.sendZoneReport = async function(regionId) {
  await loadJsPDF();

  const region = REGIONS.find(r => r.id === regionId);
  if (!region) throw new Error(`Unknown region ${regionId}`);

  const canvas      = await buildReportCanvas(regionId, region);
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.82);
  const jpegB64     = jpegDataUrl.split(',')[1];

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pgW = pdf.internal.pageSize.getWidth();
  const pgH = pdf.internal.pageSize.getHeight();
  pdf.addImage(jpegDataUrl, 'JPEG', 0, 0, pgW, pgH);
  const pdfB64 = pdf.output('datauristring').split(',')[1];

  const latestWk  = SEASON_WEEKS[SEASON_WEEKS.length - 1] || '';
  const weekLabel = latestWk
    ? fmtDate(latestWk)
    : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const resp = await fetch('/api/send-report', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pdf:        pdfB64,
      jpeg:       jpegB64,
      regionName: `Zone ${regionId} — ${region.name}`,
      weekDate:   weekLabel,
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(`Zone ${regionId}: ${body.error || resp.statusText}`);
  }
};

// ── Canvas builder ────────────────────────────────────────────────────────────
// Layout (y positions):
//   Header   0–90       (h=90)
//   Stats    98–174     (h=76)
//   Map      182–812    (h=630)
//   Trend    820–1180   (h=360)
//   GDD      1188–1680  (h=492)
//   Footer   1688–1748  (h=60)
async function buildReportCanvas(regionId, region) {
  const cvs = document.createElement('canvas');
  cvs.width  = RPT_W;
  cvs.height = RPT_H;
  const ctx  = cvs.getContext('2d');

  ctx.fillStyle = '#F5F8F5';
  ctx.fillRect(0, 0, RPT_W, RPT_H);

  const PW = RPT_W - RPT_PAD * 2;  // panel width = 1200

  drawHeader(ctx, regionId, region);
  drawStatRow(ctx, regionId, RPT_PAD, 98, PW, 76);
  await drawMapPanel(ctx, regionId, RPT_PAD, 182, PW, 630);
  drawTrendPanel(ctx, regionId, region, RPT_PAD, 820, PW, 360);
  drawGDDPanel(ctx, RPT_PAD, 1188, PW, 492);
  drawFooter(ctx);

  return cvs;
}

// ═════════════════════════════════════════════════════════════════════════════
// HEADER
// ═════════════════════════════════════════════════════════════════════════════
function drawHeader(ctx, regionId, region) {
  ctx.fillStyle = '#1A3D23';
  ctx.fillRect(0, 0, RPT_W, 86);

  ctx.fillStyle = region.color;
  ctx.fillRect(0, 86, RPT_W, 4);

  ctx.fillStyle = 'white';
  ctx.font      = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Zone ${regionId} — ${region.name}  ·  Filbertworm Trap Report`, RPT_PAD + 16, 40);

  const latestWk  = SEASON_WEEKS[SEASON_WEEKS.length - 1] || '';
  const weekLabel = latestWk ? `Week of ${fmtDate(latestWk)}` : '';
  const today     = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  ctx.font      = '15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`Valley Agronomics Donald  ·  ${weekLabel}  ·  Generated ${today}`, RPT_PAD + 16, 68);
}

// ═════════════════════════════════════════════════════════════════════════════
// STAT ROW — 4 boxes
// ═════════════════════════════════════════════════════════════════════════════
function drawStatRow(ctx, regionId, x, y, w, h) {
  const traps     = regionTraps(regionId);
  const latestWk  = SEASON_WEEKS[SEASON_WEEKS.length - 1] || SEASON_WEEKS[0];
  const latestAvg = regionWeeklyAvg(regionId, latestWk);
  const peakAvg   = regionPeakAvg(regionId);
  const aboveCt   = traps.filter(t => t.weeks.some(w => w.count >= THRESHOLD_SINGLE)).length;
  const cumDD     = window._currentDD || 0;

  const boxes = [
    { label: 'Traps Monitored',  value: traps.length.toString(),         color: '#2B6E3B' },
    { label: 'This Week Avg',    value: fmtCount(latestAvg) + ' / trap', color: '#2B6E3B' },
    { label: 'Season Peak Avg',  value: fmtCount(peakAvg)  + ' / trap',  color: peakAvg  >= THRESHOLD_SINGLE ? '#C0392B' : '#2B6E3B' },
    { label: 'DD Accumulated',   value: Math.round(cumDD) + ' DD',        color: '#1976D2' },
  ];

  const gap  = 12;
  const boxW = (w - gap * (boxes.length - 1)) / boxes.length;

  boxes.forEach((box, i) => {
    const bx = x + i * (boxW + gap);
    drawCard(ctx, bx, y, boxW, h, 8);

    ctx.fillStyle = box.color;
    ctx.font      = 'bold 30px system-ui, sans-serif';
    ctx.fillText(box.value, bx + 16, y + 46);

    ctx.fillStyle = '#6B7F72';
    ctx.font      = '12px system-ui, sans-serif';
    ctx.fillText(box.label, bx + 16, y + 64);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// MAP PANEL — OSM basemap + trap dots
// ═════════════════════════════════════════════════════════════════════════════
async function drawMapPanel(ctx, regionId, x, y, w, h) {
  drawCard(ctx, x, y, w, h, 10);
  panelTitle(ctx, 'Trap Locations — Current Week Count', x, y, w);

  const traps    = regionTraps(regionId).filter(t => t.lat && t.lon);
  const latestWk = SEASON_WEEKS[SEASON_WEEKS.length - 1] || SEASON_WEEKS[0];

  // Map drawing area inside card
  const mx = x + 8, my = y + 36, mw = w - 16, mh = h - 44 - 24; // 24 = legend row

  if (!traps.length) {
    ctx.fillStyle = '#EDF2EF';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#9E9E9E';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No trap location data', mx + mw / 2, my + mh / 2);
    ctx.textAlign = 'left';
    return;
  }

  const lats = traps.map(t => t.lat), lons = traps.map(t => t.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);

  const latSpan = maxLat - minLat || 0.02;
  const lonSpan = maxLon - minLon || 0.02;
  const latPad  = latSpan * 0.28 + 0.010;
  const lonPad  = lonSpan * 0.28 + 0.010;

  const vMinLat = minLat - latPad, vMaxLat = maxLat + latPad;
  const vMinLon = minLon - lonPad, vMaxLon = maxLon + lonPad;

  // Pick zoom level so viewport fits in mw × mh
  const TILE = 256;
  let zoom = 15;
  for (; zoom >= 9; zoom--) {
    const vpW = (lonToTileX(vMaxLon, zoom) - lonToTileX(vMinLon, zoom)) * TILE;
    const vpH = (latToTileY(vMinLat, zoom) - latToTileY(vMaxLat, zoom)) * TILE;
    if (vpW <= mw * 1.6 && vpH <= mh * 1.6) break;
  }

  // Fractional tile coords of viewport corners
  const ftx0 = lonToTileX(vMinLon, zoom), ftx1 = lonToTileX(vMaxLon, zoom);
  const fty0 = latToTileY(vMaxLat, zoom), fty1 = latToTileY(vMinLat, zoom);

  // Integer tile indices
  const tx0 = Math.floor(ftx0), tx1 = Math.ceil(ftx1);
  const ty0 = Math.floor(fty0), ty1 = Math.ceil(fty1);

  // Offscreen tile canvas
  const tc    = document.createElement('canvas');
  tc.width    = (tx1 - tx0) * TILE;
  tc.height   = (ty1 - ty0) * TILE;
  const tctx  = tc.getContext('2d');
  tctx.fillStyle = '#D6E4EC';
  tctx.fillRect(0, 0, tc.width, tc.height);

  const subs  = ['a', 'b', 'c'];
  const loads = [];
  for (let tx = tx0; tx < tx1; tx++) {
    for (let ty = ty0; ty < ty1; ty++) {
      const sub = subs[(tx + ty) % 3];
      const url = `https://${sub}.tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
      loads.push(loadTileImg(url, tctx, (tx - tx0) * TILE, (ty - ty0) * TILE));
    }
  }
  await Promise.allSettled(loads);

  // Check for CORS taint
  let tainted = false;
  try { tc.toDataURL(); } catch (_) { tainted = true; }

  // Viewport region within tile canvas (in pixels)
  const vpPixX = (ftx0 - tx0) * TILE, vpPixY = (fty0 - ty0) * TILE;
  const vpPixW = (ftx1 - ftx0) * TILE, vpPixH = (fty1 - fty0) * TILE;

  // Scale to fit mw × mh
  const scale = Math.min(mw / vpPixW, mh / vpPixH);
  const dstW  = vpPixW * scale, dstH = vpPixH * scale;
  const dstX  = mx + (mw - dstW) / 2;
  const dstY  = my + (mh - dstH) / 2;

  if (!tainted) {
    ctx.drawImage(tc, vpPixX, vpPixY, vpPixW, vpPixH, dstX, dstY, dstW, dstH);
    // OSM attribution
    const attrW = 222, attrH = 16;
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.fillRect(dstX + dstW - attrW, dstY + dstH - attrH, attrW, attrH);
    ctx.fillStyle = '#444';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText('© OpenStreetMap contributors', dstX + dstW - attrW + 4, dstY + dstH - 4);
  } else {
    // Fallback: plain topo-style background
    ctx.fillStyle = '#D6E4EC';
    ctx.fillRect(dstX, dstY, dstW, dstH);
    ctx.fillStyle = '#9E9E9E';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Map tiles unavailable', dstX + dstW / 2, dstY + dstH / 2);
    ctx.textAlign = 'left';
  }

  // Thin border around map image
  ctx.strokeStyle = '#C8D8CA';
  ctx.lineWidth   = 1;
  ctx.strokeRect(dstX, dstY, dstW, dstH);

  // Helper: lat/lon → display pixel
  const geoToPx = (lat, lon) => {
    const relX = (lonToTileX(lon, zoom) - ftx0) / (ftx1 - ftx0);
    const relY = (latToTileY(lat, zoom) - fty0) / (fty1 - fty0);
    return { x: dstX + relX * dstW, y: dstY + relY * dstH };
  };

  // Draw trap dots
  ctx.save();
  ctx.beginPath();
  ctx.rect(dstX, dstY, dstW, dstH);
  ctx.clip();

  for (const trap of traps) {
    const { x: px, y: py } = geoToPx(trap.lat, trap.lon);
    const count = trapAtWeek(trap, latestWk);
    const col   = colorForCount(count);

    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = col.hex;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    if (count > 0) {
      ctx.fillStyle  = 'white';
      ctx.font       = 'bold 8px system-ui, sans-serif';
      ctx.textAlign  = 'center';
      ctx.fillText(fmtCount(count), px, py + 3.5);
    }
  }
  ctx.restore();
  ctx.textAlign = 'left';

  // Legend row below map
  const legendItems = [
    { label: '0',           color: '#78C66A' },
    { label: '1–2',         color: '#E8C547' },
    { label: '3–4',         color: '#E88C47' },
    { label: '≥5 (action)', color: '#E84747' },
  ];
  let lx = x + 16;
  const ly = y + h - 14;
  ctx.font = '11px system-ui, sans-serif';
  for (const li of legendItems) {
    ctx.beginPath();
    ctx.arc(lx + 6, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = li.color;
    ctx.fill();
    ctx.fillStyle = '#6B7F72';
    ctx.fillText(li.label, lx + 15, ly + 4);
    lx += 106;
  }
}

// Mercator tile coordinate helpers
function lonToTileX(lon, zoom) {
  return (lon + 180) / 360 * (1 << zoom);
}
function latToTileY(lat, zoom) {
  const rad = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * (1 << zoom);
}

function loadTileImg(url, tctx, px, py) {
  return new Promise(resolve => {
    const img         = new Image();
    img.crossOrigin   = 'anonymous';
    const timer       = setTimeout(resolve, 5000);
    img.onload  = () => { clearTimeout(timer); tctx.drawImage(img, px, py); resolve(); };
    img.onerror = () => { clearTimeout(timer); resolve(); };
    img.src           = url;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// TREND CHART — zone avg + highest single trap
// ═════════════════════════════════════════════════════════════════════════════
function drawTrendPanel(ctx, regionId, region, x, y, w, h) {
  drawCard(ctx, x, y, w, h, 10);
  panelTitle(ctx, `Season Trap Catch — ${region.name}`, x, y, w);

  const traps   = regionTraps(regionId);
  const n       = SEASON_WEEKS.length;

  const avgData = SEASON_WEEKS.map(wk => regionWeeklyAvg(regionId, wk));
  const maxData = SEASON_WEEKS.map(wk =>
    traps.length ? Math.max(...traps.map(t => trapAtWeek(t, wk)), 0) : 0
  );

  const yMax = Math.max(...avgData, ...maxData, THRESHOLD_SINGLE + 1) * 1.15;

  const padL = 52, padR = 20, padT = 44, padB = 46;
  const cx = x + padL, cy = y + padT;
  const cw = w - padL - padR, ch = h - padT - padB;

  const toX = i => cx + (n > 1 ? i / (n - 1) : 0.5) * cw;
  const toY = v => cy + ch - (v / yMax) * ch;

  // Grid + Y labels
  for (let i = 0; i <= 4; i++) {
    const gy  = cy + (i / 4) * ch;
    const val = ((1 - i / 4) * yMax).toFixed(1);
    ctx.strokeStyle = '#EEEEEE';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx + cw, gy); ctx.stroke();
    ctx.fillStyle   = '#BDBDBD';
    ctx.font        = '10px system-ui, sans-serif';
    ctx.textAlign   = 'right';
    ctx.fillText(val, cx - 5, gy + 4);
  }
  ctx.textAlign = 'left';

  // Y-axis title
  ctx.save();
  ctx.translate(x + 12, cy + ch / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#9E9E9E';
  ctx.font      = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Moths / trap / week', 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';

  // Threshold line
  const thrY = toY(THRESHOLD_SINGLE);
  ctx.beginPath();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#C0392B';
  ctx.lineWidth   = 1.5;
  ctx.moveTo(cx, thrY); ctx.lineTo(cx + cw, thrY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#C0392B';
  ctx.font      = 'bold 9px system-ui, sans-serif';
  ctx.fillText('Action level (5)', cx + 6, thrY - 5);

  if (!n) return;

  // Area fill for avg
  ctx.beginPath();
  avgData.forEach((v, i) => {
    const [px, py] = [toX(i), toY(v)];
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.lineTo(toX(n - 1), cy + ch); ctx.lineTo(cx, cy + ch); ctx.closePath();
  ctx.fillStyle = region.color + '22'; ctx.fill();

  // Avg line
  ctx.beginPath();
  avgData.forEach((v, i) => {
    const [px, py] = [toX(i), toY(v)];
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.strokeStyle = region.color; ctx.lineWidth = 2.5; ctx.stroke();

  // Avg points
  avgData.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(v), 4, 0, Math.PI * 2);
    ctx.fillStyle = region.color; ctx.fill();
  });

  // Max line (dashed, orange)
  ctx.beginPath();
  ctx.setLineDash([5, 4]);
  maxData.forEach((v, i) => {
    const [px, py] = [toX(i), toY(v)];
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.strokeStyle = '#E88C47'; ctx.lineWidth = 2; ctx.stroke();
  ctx.setLineDash([]);

  // Max points
  maxData.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(v), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#E88C47'; ctx.fill();
  });

  // X-axis labels (up to 8 evenly spaced)
  const step = Math.max(1, Math.ceil(n / 8));
  ctx.fillStyle = '#9E9E9E'; ctx.font = '10px system-ui, sans-serif';
  SEASON_WEEKS.forEach((wk, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    ctx.textAlign = 'center';
    ctx.fillText(fmtDate(wk), toX(i), cy + ch + 14);
  });
  ctx.textAlign = 'left';

  // Legend
  const liy = cy + ch + 32;
  let lx = cx;
  ctx.font = '11px system-ui, sans-serif';

  ctx.strokeStyle = region.color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(lx, liy - 3); ctx.lineTo(lx + 26, liy - 3); ctx.stroke();
  ctx.beginPath(); ctx.arc(lx + 13, liy - 3, 4, 0, Math.PI * 2);
  ctx.fillStyle = region.color; ctx.fill();
  ctx.fillStyle = '#555';
  ctx.fillText('Zone average (moths/trap/wk)', lx + 32, liy + 1);
  lx += 230;

  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#E88C47'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lx, liy - 3); ctx.lineTo(lx + 26, liy - 3); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(lx + 13, liy - 3, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#E88C47'; ctx.fill();
  ctx.fillStyle = '#555';
  ctx.fillText('Highest single trap', lx + 32, liy + 1);
}

// ═════════════════════════════════════════════════════════════════════════════
// GDD ACCUMULATION CHART
// ═════════════════════════════════════════════════════════════════════════════
function drawGDDPanel(ctx, x, y, w, h) {
  drawCard(ctx, x, y, w, h, 10);
  panelTitle(ctx, 'Growing Degree Day Accumulation (base 50°F · Biofix April 1) — Aurora, OR', x, y, w);

  const actual    = window._ddActual    || [];
  const projected = window._ddProjected || [];
  const typical   = window._ddTypical   || [];

  if (!projected.length) {
    ctx.fillStyle = '#9E9E9E';
    ctx.font      = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Degree day data loading…', x + w / 2, y + h / 2);
    ctx.textAlign = 'left';
    return;
  }

  const padL = 58, padR = 24, padT = 46, padB = 52;
  const cx = x + padL, cy = y + padT;
  const cw = w - padL - padR, ch = h - padT - padB;

  const nPoints = projected.length;
  const maxDD   = Math.max(...projected.map(d => d.cumDD), DD_PEAK_ADULT + 150);

  const toX = i => cx + (nPoints > 1 ? i / (nPoints - 1) : 0.5) * cw;
  const toY = v => cy + ch - (v / maxDD) * ch;

  // Horizontal grid + Y labels
  for (let dd = 0; dd <= maxDD; dd += 200) {
    const gy = toY(dd);
    if (gy < cy - 2 || gy > cy + ch + 2) continue;
    ctx.strokeStyle = '#EEEEEE'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx + cw, gy); ctx.stroke();
    ctx.fillStyle = '#BDBDBD'; ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(dd.toString(), cx - 5, gy + 4);
  }

  // Y-axis title
  ctx.save();
  ctx.translate(x + 14, cy + ch / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#9E9E9E';
  ctx.font      = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Cumulative DD (base 50°F)', 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';

  // Vertical month lines + X labels
  const monthAbbr = ['', '', '', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  projected.forEach((d, i) => {
    const dt = new Date(d.date + 'T12:00:00');
    if (dt.getDate() !== 1) return;
    const lx2 = toX(i);
    ctx.strokeStyle = '#E8E8E8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx2, cy); ctx.lineTo(lx2, cy + ch); ctx.stroke();
    ctx.fillStyle = '#9E9E9E'; ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(monthAbbr[dt.getMonth()] || '', lx2, cy + ch + 14);
  });
  ctx.textAlign = 'left';

  // Phenology threshold lines
  const thresholds = [
    { dd: DD_FIRST_FLIGHT, color: '#E8A000', label: '1st Flight  610 DD' },
    { dd: DD_EGG_HATCH,    color: '#D44000', label: 'Peak Egg Hatch  1,023 DD' },
    { dd: DD_PEAK_ADULT,   color: '#8B2FC9', label: 'Peak Adult  1,188 DD' },
  ];
  ctx.font = 'bold 9px system-ui, sans-serif';
  for (const t of thresholds) {
    if (t.dd > maxDD * 1.05) continue;
    const gy = toY(t.dd);
    ctx.beginPath();
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = t.color; ctx.lineWidth = 1.5;
    ctx.moveTo(cx, gy); ctx.lineTo(cx + cw, gy); ctx.stroke();
    ctx.setLineDash([]);
    const lw = ctx.measureText(t.label).width + 14;
    ctx.fillStyle = t.color;
    rrect(ctx, cx + cw - lw - 2, gy - 10, lw, 15, 4); ctx.fill();
    ctx.fillStyle = 'white';
    ctx.fillText(t.label, cx + cw - lw + 5, gy + 1);
  }

  // Typical season line (gray dashed)
  const typicalMap = Object.fromEntries(typical.map(d => [d.date, d.cumDD]));
  ctx.beginPath(); ctx.setLineDash([4, 6]);
  ctx.strokeStyle = '#C0C0C0'; ctx.lineWidth = 1.5;
  let started = false;
  projected.forEach((d, i) => {
    const val = typicalMap[d.date];
    if (val === undefined) return;
    const [px, py] = [toX(i), toY(val)];
    if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
  });
  ctx.stroke(); ctx.setLineDash([]);

  // Actual area fill
  const actualEnd = actual.length;
  if (actualEnd > 0) {
    ctx.beginPath();
    actual.forEach((d, i) => {
      const [px, py] = [toX(i), toY(d.cumDD)];
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.lineTo(toX(actualEnd - 1), cy + ch);
    ctx.lineTo(cx, cy + ch);
    ctx.closePath();
    ctx.fillStyle = 'rgba(43,110,59,0.09)'; ctx.fill();
  }

  // Actual DD line (solid green)
  if (actualEnd > 0) {
    ctx.beginPath();
    actual.forEach((d, i) => {
      const [px, py] = [toX(i), toY(d.cumDD)];
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.strokeStyle = '#2B6E3B'; ctx.lineWidth = 2.5; ctx.stroke();
  }

  // Projected line (dashed green, from last actual point onward)
  if (actualEnd < nPoints) {
    ctx.beginPath(); ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#2B6E3B'; ctx.lineWidth = 2;
    projected.forEach((d, i) => {
      if (i < actualEnd - 1) return;
      const [px, py] = [toX(i), toY(d.cumDD)];
      i === actualEnd - 1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke(); ctx.setLineDash([]);
  }

  // Today vertical marker
  const today    = new Date().toISOString().split('T')[0];
  const todayIdx = projected.findIndex(d => d.date >= today);
  if (todayIdx > 0) {
    const tx2 = toX(todayIdx);
    ctx.beginPath(); ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#1A3D23'; ctx.lineWidth = 1.5;
    ctx.moveTo(tx2, cy); ctx.lineTo(tx2, cy + ch); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#1A3D23'; ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Today', tx2, cy + 11);
    ctx.textAlign = 'left';
  }

  // Legend
  const liy = cy + ch + 34;
  let lx = cx;
  ctx.font = '11px system-ui, sans-serif';

  ctx.strokeStyle = '#2B6E3B'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(lx, liy - 3); ctx.lineTo(lx + 24, liy - 3); ctx.stroke();
  ctx.fillStyle = '#555'; ctx.fillText('Actual DD', lx + 28, liy + 1); lx += 110;

  ctx.setLineDash([6, 4]); ctx.strokeStyle = '#2B6E3B'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lx, liy - 3); ctx.lineTo(lx + 24, liy - 3); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#555'; ctx.fillText('Projected (hist. avg)', lx + 28, liy + 1); lx += 200;

  ctx.setLineDash([4, 6]); ctx.strokeStyle = '#C0C0C0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(lx, liy - 3); ctx.lineTo(lx + 24, liy - 3); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#555'; ctx.fillText('Typical season', lx + 28, liy + 1);
}

// ═════════════════════════════════════════════════════════════════════════════
// FOOTER
// ═════════════════════════════════════════════════════════════════════════════
function drawFooter(ctx) {
  ctx.fillStyle = '#1A3D23';
  ctx.fillRect(0, RPT_H - 60, RPT_W, 60);

  ctx.fillStyle = 'rgba(255,255,255,0.50)';
  ctx.font      = '11px system-ui, sans-serif';
  ctx.fillText(
    'Valley Agronomics Donald  ·  Internal Report  ·  Confidential — Do not distribute',
    RPT_PAD + 16, RPT_H - 35
  );
  ctx.fillText(
    'Delta traps checked weekly by Valley Ag scouting staff  ·  Spray decisions require adviser consultation',
    RPT_PAD + 16, RPT_H - 16
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DRAWING HELPERS
// ═════════════════════════════════════════════════════════════════════════════
function drawCard(ctx, x, y, w, h, r) {
  ctx.fillStyle   = '#FFFFFF';
  ctx.strokeStyle = '#D4E6D7';
  ctx.lineWidth   = 1;
  rrect(ctx, x, y, w, h, r); ctx.fill();
  rrect(ctx, x, y, w, h, r); ctx.stroke();
}

function panelTitle(ctx, text, x, y, w) {
  ctx.fillStyle = '#1A3D23';
  ctx.font      = 'bold 13px system-ui, sans-serif';
  ctx.fillText(text, x + 14, y + 22);

  ctx.strokeStyle = '#D4E6D7';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 30); ctx.lineTo(x + (w || 700) - 1, y + 30);
  ctx.stroke();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x,     y,     x + r, y);
  ctx.closePath();
}
