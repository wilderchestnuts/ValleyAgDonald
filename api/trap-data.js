/* ═══════════════════════════════════════════════════════
   api/trap-data.js — Vercel serverless: shared trap data store
   Stores the latest Excel upload in Vercel Blob so every visitor
   (any device, any browser) sees the same data without uploading.

   Requires a Blob store attached to the Vercel project
   (Project → Storage → Create Database → Blob). That auto-sets
   the BLOB_READ_WRITE_TOKEN environment variable.
   ═══════════════════════════════════════════════════════ */

const { put, list } = require('@vercel/blob');

const BLOB_PATH = 'dva-trap-data.json';

async function findBlob() {
  const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
  return blobs[0] || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Never let any layer (browser, edge, CDN) cache this endpoint's response —
  // stale caching here previously caused newly-uploaded weeks to appear missing.
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'GET') {
    try {
      const blob = await findBlob();
      if (!blob) return res.status(200).json({ traps: [], weeks: [] });
      // Cache-bust the blob URL fetch itself — the blob CDN caches by URL, and
      // a fixed pathname means a stale cached copy can otherwise be served
      // even right after a fresh overwrite.
      const bustUrl  = `${blob.url}?t=${blob.uploadedAt ? new Date(blob.uploadedAt).getTime() : Date.now()}`;
      const blobResp = await fetch(bustUrl, { cache: 'no-store' });
      const data = await blobResp.json();
      return res.status(200).json(data);
    } catch (err) {
      console.error('trap-data GET error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { traps, weeks } = req.body || {};
      if (!Array.isArray(traps) || !Array.isArray(weeks)) {
        return res.status(400).json({ error: 'Request body must include traps[] and weeks[]' });
      }
      await put(BLOB_PATH, JSON.stringify({ traps, weeks }), {
        access:            'public',
        addRandomSuffix:   false,
        allowOverwrite:    true,
        contentType:       'application/json',
        cacheControlMaxAge: 0,
      });
      return res.status(200).json({ success: true, trapCount: traps.length, weekCount: weeks.length });
    } catch (err) {
      console.error('trap-data POST error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
