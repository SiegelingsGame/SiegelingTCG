#!/usr/bin/env node
/* Pre-generates the art-mirror thumbnails after a deploy.

   Every Hosting release empties the CDN, so without this the first players
   after a deploy wait on the function to resize each card they look at. The
   function keeps each thumbnail in the bucket once made (art-thumbs/), so the
   first run after new art does the resizing here, and later runs only re-read
   those objects. Best-effort: it always exits 0 and never blocks a deploy.

   Usage: node scripts/warm-art-thumbs.mjs [baseUrl] */

const BASE = (process.argv[2] || 'https://siegelingstcgtesting.web.app').replace(/\/$/, '');
const STORAGE_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/siegelingstcgtesting.firebasestorage.app/o/';
// Most-seen surfaces first (binder 480, landing 320, chips 160), so a run cut
// short by the time cap still covered what players hit first.
const WIDTHS = [480, 320, 160, 640, 240, 960];
// The function resizes two at a time per instance; a few more in flight keeps
// it busy without queueing requests long enough to time out.
const CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 60_000;
const TOTAL_BUDGET_MS = 9 * 60_000;

async function main() {
  const started = Date.now();
  const options = await fetch(`${BASE}/api/game/options`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    .then((response) => {
      if (!response.ok) throw new Error(`options ${response.status}`);
      return response.json();
    });
  const art = new Set();
  for (const item of [...(options.cardCatalog || []), ...(options.trainers || [])]) {
    const url = String(item?.cardArtUrl || '');
    if (url.startsWith(STORAGE_PREFIX)) art.add(url);
  }
  const jobs = [];
  for (const width of WIDTHS) {
    for (const url of art) jobs.push({ width, url });
  }
  console.log(`Warming ${jobs.length} thumbnails (${art.size} art files x ${WIDTHS.length} widths)`);

  const tally = { ok: 0, failed: 0, skipped: 0 };
  const slow = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (Date.now() - started > TOTAL_BUDGET_MS) {
        tally.skipped += 1;
        continue;
      }
      const t = Date.now();
      try {
        const response = await fetch(`${BASE}/api/cards/art-mirror?w=${job.width}&url=${encodeURIComponent(job.url)}`, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        await response.arrayBuffer();
        if (response.ok && String(response.headers.get('content-type')).startsWith('image/webp')) tally.ok += 1;
        else tally.failed += 1;
      } catch (error) {
        tally.failed += 1;
      }
      const ms = Date.now() - t;
      if (ms > 3000) slow.push(ms);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`Done in ${seconds}s: ${tally.ok} ok, ${tally.failed} failed, ${tally.skipped} skipped (time budget), ${slow.length} slower than 3s`);
  if (tally.failed || tally.skipped) {
    console.log('::warning::Some art thumbnails were not warmed; players will generate them on first view.');
  }
}

main().catch((error) => {
  console.log(`::warning::Art thumbnail warm-up did not run: ${error.message}`);
});
