/* ═══════════════════════════════════════════════════════
   report.js — Filbertworm JPEG report generator
   Produces 6 separate images: 1 overall + 1 per zone

   Overall (1200 × 1630):
     Header | Overall Map | Season Chart | GDD | Footer
   Zone (1200 × 876):
     Header | Zone Title | Stats | Zone Map | Footer
   ═══════════════════════════════════════════════════════ */

'use strict';

window._currentDD = 0;

const RPT_W        = 1200;
const RPT_H_OVERALL = 1630;
const RPT_H_ZONE    = 876;

// Descriptive geographic names for each zone
const ZONE_NAMES = {
  '1': 'St Paul to Newberg',
  '2': 'South of St Paul, West Woodburn',
  '3': 'Greater Donald Area',
  '4': 'South Canby',
  '5': 'East of Woodburn, Hwy 211',
};

// ── Download all 6 JPEGs locally (for texting) ───────────────────────────────
window.downloadAllReports = async function() {
  const btn      = document.getElementById('report-dl-btn');
  const statusEl = document.getElementById('report-status');

  btn.disabled           = true;
  statusEl.textContent   = 'Building reports…';
  statusEl.className     = 'report-status';
  statusEl.style.display = 'inline-block';

  try {
    if (!allTraps || !allTraps.length) throw new Error('No trap data loaded — upload your Excel file first');

    const latestWk  = SEASON_WEEKS[SEASON_WEEKS.length - 1] || '';
    const weekLabel = latestWk
      ? fmtDate(latestWk).replace(/\s/g, '-')
      : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).replace(/\s/g, '-');

    statusEl.textContent = 'Building overall map… (1/6)';
    const overallCvs = await buildOverallCanvas();
    triggerJpegDownload(overallCvs, `FilbertTrap-Overall-${weekLabel}.jpg`);

    for (let i = 0; i < REGIONS.length; i++) {
      const region = REGIONS[i];
      statusEl.textContent = `Building Zone ${region.id}… (${i + 2}/6)`;
      await new Promise(r => setTimeout(r, 400));
      const zoneCvs = await buildZoneCanvas(region);
      triggerJpegDownload(zoneCvs, `FilbertTrap-Zone${region.id}-${weekLabel}.jpg`);
    }

    statusEl.textContent = '✓ 6 report images saved — check your Downloads folder';
    statusEl.className   = 'report-status success';
  } catch (err) {
    console.error('Report download error:', err);
    statusEl.textContent = '✗ ' + err.message;
    statusEl.className   = 'report-status error';
  } finally {
    btn.disabled = false;
  }
};

function triggerJpegDownload(canvas, filename) {
  const a  = document.createElement('a');
  a.href   = canvas.toDataURL('image/jpeg', 0.85);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Email the combined all-zones report ──────────────────────────────────────
window.sendAllReports = async function() {
  const btn      = document.getElementById('report-send-btn');
  const statusEl = document.getElementById('report-status');

  btn.disabled           = true;
  statusEl.textContent   = 'Building combined report…';
  statusEl.className     = 'report-status';
  statusEl.style.display = 'inline-block';

  try {
    if (!allTraps || !allTraps.length) throw new Error('No trap data loaded — upload your Excel file first');

    statusEl.textContent = 'Generating report (loading maps…)';
    const canvas  = await buildOverallCanvas();
    const jpegB64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];

    const latestWk  = SEASON_WEEKS[SEASON_WEEKS.length - 1] || '';
    const weekLabel = latestWk
      ? fmtDate(latestWk)
      : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    statusEl.textContent = 'Sending email…';
    const resp = await fetch('/api/send-report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jpeg: jpegB64, regionName: 'All Zones', weekDate: weekLabel }),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      throw new Error(body.error || resp.statusText);
    }

    statusEl.textContent = '✓ Combined report sent';
    statusEl.className   = 'report-status success';
  } catch (err) {
    console.error('Report error:', err);
    statusEl.textContent = '✗ ' + err.message;
    statusEl.className   = 'report-status error';
  } finally {
    btn.disabled = false;
  }
};

// ── Image loader ──────────────────────────────────────────────────────────────
function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    const t   = setTimeout(() => resolve(null), 5000);
    img.onload  = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = src;
  });
}

// ── Overall canvas: header + all-zones map + season chart + GDD + footer ─────
async function buildOverallCanvas() {
  const cvs = document.createElement('canvas');
  cvs.width  = RPT_W;
  cvs.height = RPT_H_OVERALL;
  const ctx  = cvs.getContext('2d');

  ctx.fillStyle = '#F5F8F5';
  ctx.fillRect(0, 0, RPT_W, RPT_H_OVERALL);

  const logoImg = await loadImage('Valley-Ag-Logo-Web-Lg.png');
  drawHeader(ctx, logoImg, 'All Zones');
  await drawMapSection(ctx, allTraps, 'Overall Region Trap Counts', 0, 108, RPT_W, 600);
  drawAllZonesSeasonChart(ctx, 0, 716, RPT_W, 420);
  drawGDDPanel(ctx, 0, 1144, RPT_W, 420);
  drawFooter(ctx, RPT_H_OVERALL);

  return cvs;
}

// ── Per-zone canvas: header + title + stats + zone map + footer ───────────────
async function buildZoneCanvas(region) {
  const cvs = document.createElement('canvas');
  cvs.width  = RPT_W;
  cvs.height = RPT_H_ZONE;
  const ctx  = cvs.getContext('2d');

  ctx.fillStyle = '#F5F8F5';
  ctx.fillRect(0, 0, RPT_W, RPT_H_ZONE);

  const logoImg = await loadImage('Valley-Ag-Logo-Web-Lg.png');
  drawHeader(ctx, logoImg, `Zone ${region.id} — ${ZONE_NAMES[region.id] || ''}`);
  drawZoneTitleBar(ctx, region, 0, 108, RPT_W, 80);
  drawStatRow(ctx, region.id, 0, 196, RPT_W, 102);
  await drawMapSection(ctx, regionTraps(region.id),
    'Trap Locations — Current Week Count', 0, 306, RPT_W, 500);
  drawFooter(ctx, RPT_H_ZONE);

  return cvs;
}

// ═════════════════════════════════════════════════════════════════════════════
// HEADER — multi-zone color stripe across bottom
// ═════════════════════════════════════════════════════════════════════════════
function drawHeader(ctx, logoImg, title = 'All Zones') {
  ctx.fillStyle = '#1A3D23';
  ctx.fillRect(0, 0, RPT_W, 96);

  // 5-segment color stripe
  const segW = RPT_W / REGIONS.length;
  REGIONS.forEach((r, i) => {
    ctx.fillStyle = r.color;
    ctx.fillRect(Math.floor(i * segW), 96, Math.ceil(segW), 4);
  });

  let textX = 24;
  if (logoImg) {
    const maxH = 72, maxW = 200;
    const scale = Math.min(maxH / logoImg.height, maxW / logoImg.width);
    const lw = logoImg.width * scale, lh = logoImg.height * scale;
    const lx = 14, ly = Math.round((96 - lh) / 2);
    ctx.fillStyle = 'white';
    rrect(ctx, lx - 6, ly - 5, lw + 12, lh + 10, 6);
    ctx.fill();
    ctx.drawImage(logoImg, lx, ly, lw, lh);
    textX = lx + lw + 20;
  }

  ctx.fillStyle = 'white';
  ctx.font      = 'bold 34px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Filbertworm Trap Report — ${title}`, textX, 46);

  const latestWk  = SEASON_WEEKS[SEASON_WEEKS.length - 1] || '';
  const weekLabel = latestWk ? `Week of ${fmtDate(latestWk)}` : '';
  const today     = new Date().toLocaleDateString('en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  ctx.font      = '20px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(
    `Valley Agronomics Donald  ·  ${weekLabel}  ·  Generated ${today}`,
    textX, 78
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ZONE TITLE BAR — colored left stripe + zone number + geographic name
// ═════════════════════════════════════════════════════════════════════════════
function drawZoneTitleBar(ctx, region, x, y, w, h) {
  drawCard(ctx, x, y, w, h, 0);

  // Left color accent bar
  ctx.fillStyle = region.color;
  ctx.fillRect(x, y, 12, h);

  // Zone number in zone color
  ctx.fillStyle = region.color;
  ctx.font      = 'bold 36px system-ui, sans-serif';
  const zoneLabel = `Zone ${region.id}`;
  ctx.fillText(zoneLabel, x + 28, y + 52);
  const labelW = ctx.measureText(zoneLabel).width;

  // Divider
  ctx.fillStyle = '#D0D8D4';
  ctx.fillRect(x + 28 + labelW + 18, y + 16, 2, h - 32);

  // Geographic name
  ctx.fillStyle = '#2E4235';
  ctx.font      = '28px system-ui, sans-serif';
  ctx.fillText(ZONE_NAMES[region.id] || '', x + 28 + labelW + 38, y + 52);
}

// ═════════════════════════════════════════════════════════════════════════════
// STAT ROW — 4 boxes: Traps | This Week Avg | Season Peak | Highest Count
// ═════════════════════════════════════════════════════════════════════════════
function drawStatRow(ctx, regionId, x, y, w, h) {
  const traps        = regionTraps(regionId);
  const latestWk     = SEASON_WEEKS[SEASON_WEEKS.length - 1] || SEASON_WEEKS[0];
  const latestAvg    = regionWeeklyAvg(regionId, latestWk);
  const highestCount = traps.length
    ? Math.max(...traps.map(t => trapAtWeek(t, latestWk)), 0)
    : 0;
  const trapsZero  = traps.filter(t => trapAtWeek(t, latestWk) === 0).length;
  const trapsOver5 = traps.filter(t => trapAtWeek(t, latestWk) >= THRESHOLD_SINGLE).length;

  const boxes = [
    { label: 'Traps Monitored', value: traps.length.toString(),           color: '#2B6E3B' },
    { label: 'This Week Avg',   value: fmtCount(latestAvg) + ' / trap',   color: '#2B6E3B' },
    { label: 'Traps with 0',    value: trapsZero.toString(),               color: '#2B6E3B' },
    { label: 'Traps over 5',    value: trapsOver5.toString(),              color: trapsOver5 > 0 ? '#C0392B' : '#2B6E3B' },
    { label: 'Highest Count',   value: fmtCount(highestCount) + ' moths', color: highestCount >= THRESHOLD_SINGLE ? '#C0392B' : '#2B6E3B' },
  ];

  const gap  = 8;
  const boxW = (w - gap * (boxes.length - 1)) / boxes.length;

  boxes.forEach((box, i) => {
    const bx = x + i * (boxW + gap);
    drawCard(ctx, bx, y, boxW, h, 6);
    ctx.fillStyle = box.color;
    ctx.font      = 'bold 36px system-ui, sans-serif';
    ctx.fillText(box.value, bx + 18, y + 56);
    ctx.fillStyle = '#6B7F72';
    ctx.font      = '17px system-ui, sans-serif';
    ctx.fillText(box.label, bx + 18, y + 82);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// MAP SECTION — shared renderer used by both overall map and per-zone maps
// ═════════════════════════════════════════════════════════════════════════════
async function drawMapSection(ctx, traps, title, x, y, w, h) {
  drawCard(ctx, x, y, w, h, 0);
  panelTitle(ctx, title, x, y, w);

  const latestWk    = SEASON_WEEKS[SEASON_WEEKS.length - 1] || SEASON_WEEKS[0];
  const locatedTraps = traps.filter(t => t.lat && t.lon);

  const mx = x + 8, my = y + 50, mw = w - 16, mh = h - 50 - 40;

  if (!locatedTraps.length) {
    ctx.fillStyle = '#EDF2EF'; ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#9E9E9E'; ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No trap location data', mx + mw / 2, my + mh / 2);
    ctx.textAlign = 'left'; return;
  }

  // Pre-compute jittered positions so the viewport bbox covers the jittered dots
  const jittered = locatedTraps.map(trap => {
    const rand  = seededRand(trap.id);
    const miles = 1 + rand() * 4;
    const angle = rand() * Math.PI * 2;
    return {
      trap,
      jLat: trap.lat + (miles * Math.cos(angle)) / 69,
      jLon: trap.lon + (miles * Math.sin(angle)) / (69 * Math.cos(trap.lat * Math.PI / 180)),
    };
  });

  const lats   = jittered.map(j => j.jLat);
  const lons   = jittered.map(j => j.jLon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latSpan = maxLat - minLat || 0.12, lonSpan = maxLon - minLon || 0.12;
  const latPad  = latSpan * 0.30 + 0.025, lonPad = lonSpan * 0.30 + 0.025;
  const vMinLat = minLat - latPad, vMaxLat = maxLat + latPad;
  const vMinLon = minLon - lonPad, vMaxLon = maxLon + lonPad;

  const TILE = 256;
  let zoom = 15;
  for (; zoom >= 9; zoom--) {
    const vpW = (lonToTileX(vMaxLon, zoom) - lonToTileX(vMinLon, zoom)) * TILE;
    const vpH = (latToTileY(vMinLat, zoom) - latToTileY(vMaxLat, zoom)) * TILE;
    if (vpW <= mw * 1.6 && vpH <= mh * 1.6) break;
  }

  const ftx0 = lonToTileX(vMinLon, zoom), ftx1 = lonToTileX(vMaxLon, zoom);
  const fty0 = latToTileY(vMaxLat, zoom), fty1 = latToTileY(vMinLat, zoom);
  const tx0  = Math.floor(ftx0), tx1 = Math.ceil(ftx1);
  const ty0  = Math.floor(fty0), ty1 = Math.ceil(fty1);

  const tc   = document.createElement('canvas');
  tc.width   = (tx1 - tx0) * TILE;
  tc.height  = (ty1 - ty0) * TILE;
  const tctx = tc.getContext('2d');
  tctx.fillStyle = '#E8EFF5';
  tctx.fillRect(0, 0, tc.width, tc.height);

  const subs  = ['a', 'b', 'c', 'd'];
  const loads = [];
  for (let tx = tx0; tx < tx1; tx++) {
    for (let ty = ty0; ty < ty1; ty++) {
      const sub = subs[(tx + ty) % subs.length];
      loads.push(loadTileImg(
        `https://${sub}.basemaps.cartocdn.com/light_all/${zoom}/${tx}/${ty}.png`,
        tctx, (tx - tx0) * TILE, (ty - ty0) * TILE
      ));
    }
  }
  await Promise.allSettled(loads);

  let tainted = false;
  try { tc.toDataURL(); } catch (_) { tainted = true; }

  const vpPixX = (ftx0 - tx0) * TILE, vpPixY = (fty0 - ty0) * TILE;
  const vpPixW = (ftx1 - ftx0) * TILE, vpPixH = (fty1 - fty0) * TILE;
  const scale  = Math.min(mw / vpPixW, mh / vpPixH);
  const dstW   = vpPixW * scale, dstH = vpPixH * scale;
  const dstX   = mx + (mw - dstW) / 2, dstY = my + (mh - dstH) / 2;

  if (!tainted) {
    ctx.drawImage(tc, vpPixX, vpPixY, vpPixW, vpPixH, dstX, dstY, dstW, dstH);
    const attrW = 270, attrH = 20;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(dstX + dstW - attrW, dstY + dstH - attrH, attrW, attrH);
    ctx.fillStyle = '#555'; ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('© OpenStreetMap · CartoDB', dstX + dstW - attrW + 4, dstY + dstH - 4);
  } else {
    ctx.fillStyle = '#E8EFF5'; ctx.fillRect(dstX, dstY, dstW, dstH);
    ctx.fillStyle = '#9E9E9E'; ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Map tiles unavailable', dstX + dstW / 2, dstY + dstH / 2);
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = '#BCC8BE'; ctx.lineWidth = 1;
  ctx.strokeRect(dstX, dstY, dstW, dstH);

  const geoToPx = (lat, lon) => ({
    x: dstX + (lonToTileX(lon, zoom) - ftx0) / (ftx1 - ftx0) * dstW,
    y: dstY + (latToTileY(lat, zoom) - fty0) / (fty1 - fty0) * dstH,
  });

  // Draw dots at pre-computed jittered positions
  ctx.save();
  ctx.beginPath(); ctx.rect(dstX, dstY, dstW, dstH); ctx.clip();

  for (const { trap, jLat, jLon } of jittered) {
    const { x: px, y: py } = geoToPx(jLat, jLon);
    const count = trapAtWeek(trap, latestWk);
    const col   = colorForCount(count);
    const r     = 10;

    ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();

    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = col.hex; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.fillStyle = 'white'; ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fmtCount(count), px, py + 4);
  }

  ctx.restore();
  ctx.textAlign = 'left';

  // Count legend
  const legendItems = [
    { label: '0',           color: '#78C66A' },
    { label: '1–2',         color: '#E8C547' },
    { label: '3–4',         color: '#E88C47' },
    { label: '≥5 (action)', color: '#E84747' },
  ];
  let lx = x + 24;
  const ly = y + h - 20;
  ctx.font = '17px system-ui, sans-serif';
  for (const li of legendItems) {
    ctx.beginPath(); ctx.arc(lx + 8, ly, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    ctx.beginPath(); ctx.arc(lx + 8, ly, 6, 0, Math.PI * 2);
    ctx.fillStyle = li.color; ctx.fill();
    ctx.fillStyle = '#4A5E50';
    ctx.fillText(li.label, lx + 20, ly + 6);
    lx += 148;
  }
}

// Mercator tile helpers
function lonToTileX(lon, zoom) { return (lon + 180) / 360 * (1 << zoom); }
function latToTileY(lat, zoom) {
  const rad = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * (1 << zoom);
}
function loadTileImg(url, tctx, px, py) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(resolve, 5000);
    img.onload  = () => { clearTimeout(t); tctx.drawImage(img, px, py); resolve(); };
    img.onerror = () => { clearTimeout(t); resolve(); };
    img.src = url;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// ALL-ZONES SEASON CHART — one avg line per zone + overall highest trap
// ═════════════════════════════════════════════════════════════════════════════
function drawAllZonesSeasonChart(ctx, x, y, w, h) {
  drawCard(ctx, x, y, w, h, 0);
  panelTitle(ctx, 'Season Trap Catch — All Zones', x, y, w);

  const n = SEASON_WEEKS.length;

  // Compute per-region averages and overall highest single trap per week
  const regionSeries = REGIONS.map(region => ({
    region,
    avg: SEASON_WEEKS.map(wk => regionWeeklyAvg(region.id, wk)),
  }));
  const overallMaxSeries = SEASON_WEEKS.map(wk =>
    allTraps.length ? Math.max(...allTraps.map(t => trapAtWeek(t, wk)), 0) : 0
  );

  const allValues = [
    ...regionSeries.flatMap(d => d.avg),
    ...overallMaxSeries,
    THRESHOLD_SINGLE + 1,
  ];
  const yMax = Math.max(...allValues) * 1.15;

  const padL = 82, padR = 28, padT = 58, padB = 92;
  const cx = x + padL, cy = y + padT;
  const cw = w - padL - padR, ch = h - padT - padB;

  const toX = i => cx + (n > 1 ? i / (n - 1) : 0.5) * cw;
  const toY = v => cy + ch - (v / yMax) * ch;

  // Grid + Y labels
  for (let i = 0; i <= 4; i++) {
    const gy = cy + (i / 4) * ch;
    ctx.strokeStyle = '#EEEEEE'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx + cw, gy); ctx.stroke();
    ctx.fillStyle = '#AAAAAA'; ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(((1 - i / 4) * yMax).toFixed(1), cx - 8, gy + 6);
  }
  ctx.textAlign = 'left';

  ctx.save();
  ctx.translate(x + 20, cy + ch / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#9E9E9E'; ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Avg moths / trap / week', 0, 0);
  ctx.restore(); ctx.textAlign = 'left';

  // Action threshold
  const thrY = toY(THRESHOLD_SINGLE);
  ctx.beginPath(); ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 1.5;
  ctx.moveTo(cx, thrY); ctx.lineTo(cx + cw, thrY); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#C0392B'; ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('Action level (5)', cx + 8, thrY - 8);

  if (!n) return;

  // Per-zone average lines
  for (const { region, avg } of regionSeries) {
    ctx.beginPath();
    avg.forEach((v, i) => { i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)); });
    ctx.strokeStyle = region.color; ctx.lineWidth = 2.5; ctx.stroke();
    avg.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(toX(i), toY(v), 4, 0, Math.PI * 2);
      ctx.fillStyle = region.color; ctx.fill();
    });
  }

  // Overall highest single trap (dashed orange)
  ctx.beginPath(); ctx.setLineDash([5, 4]);
  overallMaxSeries.forEach((v, i) => {
    i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v));
  });
  ctx.strokeStyle = '#E88C47'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  overallMaxSeries.forEach((v, i) => {
    ctx.beginPath(); ctx.arc(toX(i), toY(v), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#E88C47'; ctx.fill();
  });

  // X labels
  const step = Math.max(1, Math.ceil(n / 8));
  ctx.fillStyle = '#9E9E9E'; ctx.font = '16px system-ui, sans-serif';
  SEASON_WEEKS.forEach((wk, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    ctx.textAlign = 'center';
    ctx.fillText(fmtDate(wk), toX(i), cy + ch + 22);
  });
  ctx.textAlign = 'left';

  // Legend: zones 1–4 on row 1, zone 5 + highest trap on row 2
  const liy1 = cy + ch + 46;
  const liy2 = cy + ch + 70;
  ctx.font    = '15px system-ui, sans-serif';

  const legendItems = [
    ...REGIONS.map(r => ({ label: `${r.name} avg`, color: r.color, dash: false })),
    { label: 'Highest single trap (any zone)', color: '#E88C47', dash: true },
  ];

  legendItems.forEach((item, idx) => {
    const row   = idx < 4 ? liy1 : liy2;
    const col   = idx < 4 ? idx  : idx - 4;
    const itemW = (cw + padR) / 4;
    const lx    = cx + col * itemW;

    if (item.dash) {
      ctx.setLineDash([5, 4]);
    }
    ctx.strokeStyle = item.color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(lx, row - 5); ctx.lineTo(lx + 24, row - 5); ctx.stroke();
    ctx.setLineDash([]);
    if (!item.dash) {
      ctx.beginPath(); ctx.arc(lx + 12, row - 5, 4, 0, Math.PI * 2);
      ctx.fillStyle = item.color; ctx.fill();
    }
    ctx.fillStyle = '#444';
    ctx.fillText(item.label, lx + 30, row + 1);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// GDD ACCUMULATION CHART
// ═════════════════════════════════════════════════════════════════════════════
function drawGDDPanel(ctx, x, y, w, h) {
  const cumDD     = window._currentDD || 0;
  const actual    = window._ddActual    || [];
  const projected = window._ddProjected || [];
  const typical   = window._ddTypical   || [];

  drawCard(ctx, x, y, w, h, 0);
  panelTitle(
    ctx,
    `Growing Degree Day Accumulation — base 50°F  ·  ${Math.round(cumDD)} DD accumulated this season`,
    x, y, w
  );

  if (!projected.length) {
    ctx.fillStyle = '#9E9E9E'; ctx.font = '17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Degree day data loading…', x + w / 2, y + h / 2);
    ctx.textAlign = 'left'; return;
  }

  const padL = 86, padR = 32, padT = 58, padB = 78;
  const cx = x + padL, cy = y + padT;
  const cw = w - padL - padR, ch = h - padT - padB;

  const nPoints = projected.length;
  const maxDD   = Math.max(...projected.map(d => d.cumDD), DD_PEAK_ADULT + 150);

  const toX = i => cx + (nPoints > 1 ? i / (nPoints - 1) : 0.5) * cw;
  const toY = v => cy + ch - (v / maxDD) * ch;

  // Y grid + labels
  for (let dd = 0; dd <= maxDD; dd += 200) {
    const gy = toY(dd);
    if (gy < cy - 2 || gy > cy + ch + 2) continue;
    ctx.strokeStyle = '#EEEEEE'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx + cw, gy); ctx.stroke();
    ctx.fillStyle = '#AAAAAA'; ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.fillText(dd.toString(), cx - 8, gy + 6);
  }

  ctx.save();
  ctx.translate(x + 20, cy + ch / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#9E9E9E'; ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Cumulative DD (base 50°F)', 0, 0);
  ctx.restore(); ctx.textAlign = 'left';

  // Month lines + labels
  const monthAbbr = ['', '', '', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  projected.forEach((d, i) => {
    const dt = new Date(d.date + 'T12:00:00');
    if (dt.getDate() !== 1) return;
    const lx2 = toX(i);
    ctx.strokeStyle = '#E8E8E8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx2, cy); ctx.lineTo(lx2, cy + ch); ctx.stroke();
    ctx.fillStyle = '#9E9E9E'; ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(monthAbbr[dt.getMonth()] || '', lx2, cy + ch + 22);
  });
  ctx.textAlign = 'left';

  // Phenology threshold lines
  const thresholds = [
    { dd: DD_FIRST_FLIGHT, color: '#E8A000', label: '1st Flight  610 DD' },
    { dd: DD_EGG_HATCH,    color: '#D44000', label: 'Peak Egg Hatch  1,023 DD' },
    { dd: DD_PEAK_ADULT,   color: '#8B2FC9', label: 'Peak Adult  1,188 DD' },
  ];
  ctx.font = 'bold 14px system-ui, sans-serif';
  for (const t of thresholds) {
    if (t.dd > maxDD * 1.05) continue;
    const gy = toY(t.dd);
    ctx.beginPath(); ctx.setLineDash([8, 5]);
    ctx.strokeStyle = t.color; ctx.lineWidth = 1.5;
    ctx.moveTo(cx, gy); ctx.lineTo(cx + cw, gy); ctx.stroke(); ctx.setLineDash([]);
    const lw = ctx.measureText(t.label).width + 18;
    ctx.fillStyle = t.color;
    rrect(ctx, cx + cw - lw - 2, gy - 12, lw, 22, 4); ctx.fill();
    ctx.fillStyle = 'white'; ctx.fillText(t.label, cx + cw - lw + 7, gy + 4);
  }

  // Typical season (gray dashed)
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

  const actualEnd = actual.length;

  // Actual area + line
  if (actualEnd > 0) {
    ctx.beginPath();
    actual.forEach((d, i) => { i === 0 ? ctx.moveTo(toX(i), toY(d.cumDD)) : ctx.lineTo(toX(i), toY(d.cumDD)); });
    ctx.lineTo(toX(actualEnd - 1), cy + ch); ctx.lineTo(cx, cy + ch); ctx.closePath();
    ctx.fillStyle = 'rgba(43,110,59,0.09)'; ctx.fill();

    ctx.beginPath();
    actual.forEach((d, i) => { i === 0 ? ctx.moveTo(toX(i), toY(d.cumDD)) : ctx.lineTo(toX(i), toY(d.cumDD)); });
    ctx.strokeStyle = '#2B6E3B'; ctx.lineWidth = 2.5; ctx.stroke();
  }

  // Projected line
  if (actualEnd < nPoints) {
    ctx.beginPath(); ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#2B6E3B'; ctx.lineWidth = 2;
    projected.forEach((d, i) => {
      if (i < actualEnd - 1) return;
      i === actualEnd - 1 ? ctx.moveTo(toX(i), toY(d.cumDD)) : ctx.lineTo(toX(i), toY(d.cumDD));
    });
    ctx.stroke(); ctx.setLineDash([]);
  }

  // Today marker
  const today    = new Date().toISOString().split('T')[0];
  const todayIdx = projected.findIndex(d => d.date >= today);
  if (todayIdx > 0) {
    const tx2 = toX(todayIdx);
    ctx.beginPath(); ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#1A3D23'; ctx.lineWidth = 1.5;
    ctx.moveTo(tx2, cy); ctx.lineTo(tx2, cy + ch); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#1A3D23'; ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('Today', tx2, cy + 16); ctx.textAlign = 'left';
  }

  // Legend
  const liy = cy + ch + 56;
  let lx = cx;
  ctx.font = '17px system-ui, sans-serif';

  ctx.strokeStyle = '#2B6E3B'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(lx, liy - 5); ctx.lineTo(lx + 28, liy - 5); ctx.stroke();
  ctx.fillStyle = '#444'; ctx.fillText('Actual DD', lx + 34, liy + 1); lx += 148;

  ctx.setLineDash([6, 4]); ctx.strokeStyle = '#2B6E3B'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lx, liy - 5); ctx.lineTo(lx + 28, liy - 5); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#444'; ctx.fillText('Projected (hist. avg)', lx + 34, liy + 1); lx += 250;

  ctx.setLineDash([4, 6]); ctx.strokeStyle = '#C0C0C0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(lx, liy - 5); ctx.lineTo(lx + 28, liy - 5); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#444'; ctx.fillText('Typical season', lx + 34, liy + 1);
}

// ═════════════════════════════════════════════════════════════════════════════
// FOOTER
// ═════════════════════════════════════════════════════════════════════════════
function drawFooter(ctx, canvasH) {
  ctx.fillStyle = '#1A3D23';
  ctx.fillRect(0, canvasH - 62, RPT_W, 62);

  ctx.fillStyle = 'rgba(255,255,255,0.50)';
  ctx.font      = '16px system-ui, sans-serif';
  ctx.fillText('Valley Agronomics Donald  ·  Do not distribute', 24, canvasH - 36);
  ctx.fillText(
    'Delta traps checked weekly by Valley Ag scouting staff  ·  Spray decisions require adviser consultation',
    24, canvasH - 14
  );
}

// Seeded pseudo-random generator (LCG) — same trap ID always gives same jitter.
function seededRand(trapId) {
  let s = 0;
  for (let i = 0; i < trapId.length; i++) {
    s = (s * 31 + trapId.charCodeAt(i)) & 0xFFFFFFFF;
  }
  return function() {
    s = (Math.imul(s, 1664525) + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
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
  ctx.font      = 'bold 26px system-ui, sans-serif';
  ctx.fillText(text, x + 16, y + 32);

  ctx.strokeStyle = '#D4E6D7'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 44); ctx.lineTo(x + (w || 700) - 1, y + 44);
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
