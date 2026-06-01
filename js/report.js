/* ═══════════════════════════════════════════════════════
   report.js — Zone PDF/JPEG report generator
   Draws to <canvas>, wraps with jsPDF, POSTs to /api/send-report
   ═══════════════════════════════════════════════════════ */

'use strict';

// Populated by app.js when DD chart loads
window._currentDD = 0;

// ── jsPDF loader ──────────────────────────────────────────────────────────────
let _jsPDFLoaded = false;
function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (_jsPDFLoaded || window.jspdf) { _jsPDFLoaded = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.onload = () => { _jsPDFLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load jsPDF'));
    document.head.appendChild(s);
  });
}

// ── Public entry points ───────────────────────────────────────────────────────

// Send all zones that have data — called from "Email Weekly Reports" button
window.sendAllReports = async function() {
  const btn      = document.getElementById('report-send-btn');
  const statusEl = document.getElementById('report-status');

  btn.disabled       = true;
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
      statusEl.textContent = `Generating Zone ${region.id} report…`;
      await sendZoneReport(region.id);
    }

    const recipient = 'morgan.curtis@valleyag.com';
    statusEl.textContent = `✓ ${zonesWithData.length} zone report(s) sent to ${recipient}`;
    statusEl.className   = 'report-status success';
  } catch (err) {
    console.error('Report error:', err);
    statusEl.textContent = '✗ ' + err.message;
    statusEl.className   = 'report-status error';
  } finally {
    btn.disabled = false;
  }
};

// Send a single zone — exposed for per-zone buttons
window.sendZoneReport = async function(regionId) {
  await loadJsPDF();

  const region = REGIONS.find(r => r.id === regionId);
  if (!region) throw new Error(`Unknown region ${regionId}`);

  const canvas  = buildReportCanvas(regionId, region);
  const jpegB64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pgW = pdf.internal.pageSize.getWidth();
  const pgH = pdf.internal.pageSize.getHeight();
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pgW, pgH);
  const pdfB64 = pdf.output('datauristring').split(',')[1];

  const latestWk  = SEASON_WEEKS[SEASON_WEEKS.length - 1] || '';
  const weekLabel = latestWk ? fmtDate(latestWk) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const resp = await fetch('/api/send-report', {
    method: 'POST',
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

// ── Canvas report builder ────────────────────────────────────────────────────

function buildReportCanvas(regionId, region) {
  // A4 landscape @ 150 dpi  →  1748 × 1240 px
  const W = 1748, H = 1240;
  const cvs = document.createElement('canvas');
  cvs.width  = W;
  cvs.height = H;
  const ctx  = cvs.getContext('2d');

  // Background
  ctx.fillStyle = '#F7FAF7';
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, W, regionId, region);
  drawStatRow(ctx, W, regionId);
  drawMapPanel(ctx, regionId, 40, 210, 700, 440);
  drawTrendPanel(ctx, regionId, region, 760, 210, 948, 210);
  drawDDPanel(ctx, 760, 440, 948, 210);
  drawTablePanel(ctx, regionId, 40, 680, W - 80, 490);
  drawFooter(ctx, W, H);

  return cvs;
}

// ── Section drawers ───────────────────────────────────────────────────────────

function drawHeader(ctx, W, regionId, region) {
  // Green bar
  ctx.fillStyle = '#1A3D23';
  ctx.fillRect(0, 0, W, 92);

  // Accent stripe
  ctx.fillStyle = region.color;
  ctx.fillRect(0, 92, W, 5);

  ctx.fillStyle = 'white';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Zone ${regionId} — ${region.name}  ·  Filbertworm Trap Report`, 36, 38);

  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  const today     = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const latestWk  = SEASON_WEEKS[SEASON_WEEKS.length - 1] || '';
  const weekLabel = latestWk ? `Week of ${fmtDate(latestWk)}` : '';
  ctx.fillText(`Valley Agronomics Donald  ·  ${weekLabel}  ·  Generated ${today}`, 36, 68);
}

function drawStatRow(ctx, W, regionId) {
  const traps      = regionTraps(regionId);
  const latestWk   = SEASON_WEEKS[SEASON_WEEKS.length - 1] || SEASON_WEEKS[0];
  const latestAvg  = regionWeeklyAvg(regionId, latestWk);
  const peakAvg    = regionPeakAvg(regionId);
  const aboveCt    = traps.filter(t => t.weeks.some(w => w.count >= THRESHOLD_SINGLE)).length;
  const cumDD      = window._currentDD || 0;

  const boxes = [
    { label: 'Traps in Zone',       value: traps.length.toString(),            color: '#2B6E3B' },
    { label: 'This Week Avg',       value: fmtCount(latestAvg) + ' / trap',    color: '#2B6E3B' },
    { label: 'Season Peak Avg',     value: fmtCount(peakAvg)  + ' / trap',     color: peakAvg  >= THRESHOLD_SINGLE ? '#C0392B' : '#2B6E3B' },
    { label: 'Traps at Action Lvl', value: aboveCt.toString(),                 color: aboveCt  >  0               ? '#C0392B' : '#2B6E3B' },
    { label: 'DD Accumulated',      value: Math.round(cumDD) + ' DD',           color: '#1976D2' },
  ];

  const boxW = 320, boxH = 76, gap = 14;
  const totalW = boxes.length * boxW + (boxes.length - 1) * gap;
  let bx = (W - totalW) / 2;
  const by = 106;

  for (const box of boxes) {
    drawCard(ctx, bx, by, boxW, boxH, 8);

    ctx.fillStyle = box.color;
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(box.value, bx + 18, by + 44);

    ctx.fillStyle = '#6B7F72';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(box.label, bx + 18, by + 62);

    bx += boxW + gap;
  }
}

function drawMapPanel(ctx, regionId, x, y, w, h) {
  drawCard(ctx, x, y, w, h, 10);
  panelTitle(ctx, 'Trap Locations — This Week\'s Count', x, y);

  const traps   = regionTraps(regionId);
  const latestWk = SEASON_WEEKS[SEASON_WEEKS.length - 1] || SEASON_WEEKS[0];

  const pad = 40, titleH = 32;
  const mx = x + pad, my = y + titleH + 8;
  const mw = w - pad * 2, mh = h - titleH - 8 - 28; // 28 for legend

  if (!traps.length) return;

  const lats = traps.map(t => t.lat), lons = traps.map(t => t.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latR = maxLat - minLat || 0.01;
  const lonR = maxLon - minLon || 0.01;

  // Light grid
  ctx.strokeStyle = '#EEF5EF';
  ctx.lineWidth   = 1;
  for (let i = 1; i < 5; i++) {
    const gx = mx + (i / 5) * mw;
    ctx.beginPath(); ctx.moveTo(gx, my); ctx.lineTo(gx, my + mh); ctx.stroke();
    const gy = my + (i / 5) * mh;
    ctx.beginPath(); ctx.moveTo(mx, gy); ctx.lineTo(mx + mw, gy); ctx.stroke();
  }

  // Traps
  for (const trap of traps) {
    const px    = mx + ((trap.lon - minLon) / lonR) * mw;
    const py    = my + mh - ((trap.lat - minLat) / latR) * mh;
    const count = trapAtWeek(trap, latestWk);
    const col   = colorForCount(count);

    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = col.hex;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth   = 2;
    ctx.stroke();
  }

  // Legend row
  const legendItems = [
    { label: '0',    color: '#78C66A' },
    { label: '1–2',  color: '#E8C547' },
    { label: '3–4',  color: '#E88C47' },
    { label: '≥5 (action)', color: '#E84747' },
  ];
  let lx = x + 18;
  const ly = y + h - 16;
  ctx.font = '11px system-ui, sans-serif';
  for (const li of legendItems) {
    ctx.beginPath();
    ctx.arc(lx + 6, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = li.color;
    ctx.fill();
    ctx.fillStyle = '#6B7F72';
    ctx.fillText(li.label, lx + 15, ly + 4);
    lx += 90;
  }
}

function drawTrendPanel(ctx, regionId, region, x, y, w, h) {
  drawCard(ctx, x, y, w, h, 10);
  panelTitle(ctx, `Season Trend — ${region.name}`, x, y);

  const data    = SEASON_WEEKS.map(wk => regionWeeklyAvg(regionId, wk));
  const maxVal  = Math.max(...data, THRESHOLD_SINGLE + 1) * 1.1;
  const padL = 50, padR = 16, padT = 36, padB = 28;
  const cx = x + padL, cy = y + padT;
  const cw = w - padL - padR, ch = h - padT - padB;

  // Grid + y-axis
  ctx.strokeStyle = '#EEF5EF';
  ctx.fillStyle   = '#9E9E9E';
  ctx.font        = '10px system-ui, sans-serif';
  for (let i = 0; i <= 4; i++) {
    const gy  = cy + ch - (i / 4) * ch;
    const val = ((i / 4) * maxVal).toFixed(1);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx + cw, gy); ctx.stroke();
    ctx.fillText(val, x + padL - 34, gy + 4);
  }

  // Threshold dashed line
  const thrY = cy + ch - (THRESHOLD_SINGLE / maxVal) * ch;
  ctx.beginPath();
  ctx.strokeStyle = '#C0392B';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth   = 1.5;
  ctx.moveTo(cx, thrY); ctx.lineTo(cx + cw, thrY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#C0392B';
  ctx.font      = '10px system-ui, sans-serif';
  ctx.fillText('Action level (5)', cx + 4, thrY - 4);

  // Area fill
  ctx.beginPath();
  data.forEach((val, i) => {
    const px = cx + (data.length > 1 ? (i / (data.length - 1)) : 0.5) * cw;
    const py = cy + ch - (val / maxVal) * ch;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  const lastX = cx + cw;
  ctx.lineTo(lastX, cy + ch);
  ctx.lineTo(cx, cy + ch);
  ctx.closePath();
  ctx.fillStyle = region.color + '22';
  ctx.fill();

  // Line
  ctx.beginPath();
  data.forEach((val, i) => {
    const px = cx + (data.length > 1 ? (i / (data.length - 1)) : 0.5) * cw;
    const py = cy + ch - (val / maxVal) * ch;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = region.color;
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // Points
  data.forEach((val, i) => {
    const px = cx + (data.length > 1 ? (i / (data.length - 1)) : 0.5) * cw;
    const py = cy + ch - (val / maxVal) * ch;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = region.color;
    ctx.fill();
  });

  // X-axis labels (every 2nd week)
  ctx.fillStyle = '#9E9E9E';
  ctx.font      = '9px system-ui, sans-serif';
  SEASON_WEEKS.forEach((wk, i) => {
    if (i % 2 !== 0) return;
    const px = cx + (SEASON_WEEKS.length > 1 ? (i / (SEASON_WEEKS.length - 1)) : 0.5) * cw;
    ctx.fillText(fmtDate(wk), px - 12, y + h - 8);
  });
}

function drawDDPanel(ctx, x, y, w, h) {
  drawCard(ctx, x, y, w, h, 10);
  panelTitle(ctx, 'Growing Degree Days — Aurora, OR', x, y);

  const cumDD = window._currentDD || 0;
  const year  = new Date().getFullYear();

  // Progress bar
  const barX = x + 20, barY = y + 52, barW = w - 40, barH = 16;
  ctx.fillStyle = '#D8E9DB';
  rrect(ctx, barX, barY, barW, barH, 8); ctx.fill();
  const pct = Math.min(cumDD / 1200, 1);
  ctx.fillStyle = pct > 0.85 ? '#C0392B' : pct > 0.5 ? '#E8A000' : '#2B6E3B';
  rrect(ctx, barX, barY, barW * pct, barH, 8); ctx.fill();

  ctx.fillStyle = '#3D5444';
  ctx.font      = 'bold 13px system-ui, sans-serif';
  ctx.fillText(`${Math.round(cumDD)} DD accumulated (base 50°F, biofix Apr 1)`, x + 20, y + 90);

  // Phenology milestones
  const phases = [
    { dd: 610,  label: '610 DD — First Adult Flight',  color: '#E8A000' },
    { dd: 1023, label: '1,023 DD — Peak Egg Hatch',    color: '#D44000' },
    { dd: 1188, label: '1,188 DD — Peak Adult',        color: '#8B2FC9' },
  ];
  let py = y + 112;
  for (const ph of phases) {
    const reached = cumDD >= ph.dd;
    ctx.fillStyle = reached ? ph.color : '#BDBDBD';
    ctx.font      = reached ? 'bold 11px system-ui, sans-serif' : '11px system-ui, sans-serif';
    ctx.fillText((reached ? '✓ ' : '○ ') + ph.label + (reached ? ' — Reached' : `  (−${Math.round(ph.dd - cumDD)} DD)`), x + 20, py);
    py += 22;
  }

  ctx.fillStyle = '#9E9E9E';
  ctx.font      = '10px system-ui, sans-serif';
  ctx.fillText(`Live data via Open-Meteo · ARAO Aurora, OR`, x + 20, y + h - 10);
}

function drawTablePanel(ctx, regionId, x, y, w, h) {
  drawCard(ctx, x, y, w, h, 10);
  panelTitle(ctx, 'Trap-by-Trap Catch Data', x, y);

  const traps    = regionTraps(regionId);
  const latestWk = SEASON_WEEKS[SEASON_WEEKS.length - 1] || SEASON_WEEKS[0];

  // Column layout
  const cols = [
    { label: 'Trap ID',   x: x + 18,  w: 90  },
    { label: 'Grower / Farm',   x: x + 118, w: 240 },
    { label: 'This Week',       x: x + 368, w: 70  },
    ...SEASON_WEEKS.map((wk, i) => ({ label: fmtDate(wk), x: x + 448 + i * 88, w: 84 })),
  ];

  const colsToShow = cols.filter(c => c.x + c.w < x + w + 20);

  // Table header
  const hdrY = y + 34;
  ctx.fillStyle = '#EEF5EF';
  ctx.fillRect(x + 1, hdrY - 14, w - 2, 20);

  ctx.fillStyle = '#3D5444';
  ctx.font      = 'bold 10px system-ui, sans-serif';
  for (const col of colsToShow) {
    ctx.fillText(col.label, col.x, hdrY);
  }

  // Divider
  ctx.strokeStyle = '#D8E9DB';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(x + 1, hdrY + 6); ctx.lineTo(x + w - 1, hdrY + 6); ctx.stroke();

  // Rows
  const rowH   = 16;
  const maxRows = Math.floor((h - 50) / rowH);
  const visible = traps.slice(0, maxRows);

  visible.forEach((trap, i) => {
    const ry = hdrY + 18 + i * rowH;

    if (i % 2 === 0) {
      ctx.fillStyle = '#F7FAF7';
      ctx.fillRect(x + 1, ry - 11, w - 2, rowH);
    }

    const thisWkCount = trapAtWeek(trap, latestWk);
    const isAlert     = thisWkCount >= THRESHOLD_SINGLE;

    // Trap ID
    ctx.fillStyle = '#3D5444';
    ctx.font      = 'bold 10px system-ui, sans-serif';
    ctx.fillText(trap.id, cols[0].x, ry);

    // Grower
    ctx.fillStyle = '#6B7F72';
    ctx.font      = '10px system-ui, sans-serif';
    const growerStr = (trap.grower || '—').substring(0, 28);
    ctx.fillText(growerStr, cols[1].x, ry);

    // This week count
    ctx.fillStyle = isAlert ? '#C0392B' : '#2B6E3B';
    ctx.font      = isAlert ? 'bold 11px system-ui, sans-serif' : '10px system-ui, sans-serif';
    ctx.fillText(thisWkCount.toString(), cols[2].x + 20, ry);

    // Historical weekly counts
    SEASON_WEEKS.forEach((wk, wi) => {
      const col = colsToShow.find(c => c.label === fmtDate(wk));
      if (!col) return;
      const cnt = trapAtWeek(trap, wk);
      ctx.fillStyle = cnt >= THRESHOLD_SINGLE ? '#C0392B' : '#6B7F72';
      ctx.font      = cnt >= THRESHOLD_SINGLE ? 'bold 10px system-ui, sans-serif' : '10px system-ui, sans-serif';
      ctx.fillText(cnt.toString(), col.x + 24, ry);
    });
  });

  if (traps.length > maxRows) {
    ctx.fillStyle = '#9E9E9E';
    ctx.font      = '10px system-ui, sans-serif';
    ctx.fillText(`… ${traps.length - maxRows} more traps not shown`, x + 18, y + h - 8);
  }
}

function drawFooter(ctx, W, H) {
  ctx.fillStyle = '#1A3D23';
  ctx.fillRect(0, H - 44, W, 44);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font      = '11px system-ui, sans-serif';
  ctx.fillText('Valley Agronomics Donald — Internal Report — Confidential — Do not distribute', 36, H - 20);
  ctx.fillText('Pheromone delta traps checked weekly by Valley Ag scouting staff · Spray decisions require adviser consultation', W - 640, H - 20);
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawCard(ctx, x, y, w, h, r) {
  ctx.fillStyle   = '#FFFFFF';
  ctx.strokeStyle = '#D8E9DB';
  ctx.lineWidth   = 1;
  rrect(ctx, x, y, w, h, r);
  ctx.fill();
  rrect(ctx, x, y, w, h, r);
  ctx.stroke();
}

function panelTitle(ctx, text, x, y) {
  ctx.fillStyle = '#1A3D23';
  ctx.font      = 'bold 13px system-ui, sans-serif';
  ctx.fillText(text, x + 16, y + 22);

  ctx.strokeStyle = '#D8E9DB';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(x + 1, y + 30); ctx.lineTo(x + 699, y + 30); ctx.stroke();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
