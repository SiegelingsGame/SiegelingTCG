#!/usr/bin/env node
'use strict';

/* Makes sure every card and SiegeKnight art file players can see has its
   ready-made thumbnails (see ../artThumbs.js). Art uploaded through the
   dashboard gets them at upload; this covers everything older, and anything an
   upload failed to finish. It only creates what is missing, so after the first
   run it is a quick existence check.

   Runs in the deploy workflow, before the Hosting release, with the deploy
   service account (GOOGLE_APPLICATION_CREDENTIALS). Best-effort: it always
   exits 0, because a missing thumbnail only means that card falls back to the
   art mirror.

   Usage: node scripts/build-art-thumbs.js [siteUrl] */

const artThumbs = require('../artThumbs');

const BUCKET = process.env.STORAGE_BUCKET || 'siegelingstcgtesting.firebasestorage.app';
const STORAGE_PREFIX = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/`;
const TOTAL_BUDGET_MS = 10 * 60_000;
const CONCURRENCY = 3;

function artUrlsFromCatalog(options) {
  const urls = new Set();
  for (const item of [...(options?.cardCatalog || []), ...(options?.trainers || [])]) {
    const url = String(item?.cardArtUrl || '');
    if (url.startsWith(STORAGE_PREFIX) && artThumbs.artToken(url)) urls.add(url);
  }
  return [...urls];
}

async function exists(bucket, path) {
  const [found] = await bucket.file(path).exists();
  return found;
}

/* deps: { bucket, fetchCatalog() -> options, fetchOriginal(url) -> Buffer, now() } */
async function run(deps) {
  const started = deps.now();
  const urls = artUrlsFromCatalog(await deps.fetchCatalog());
  const tally = { art: urls.length, complete: 0, built: 0, failed: 0, skipped: 0 };
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      if (deps.now() - started > TOTAL_BUDGET_MS) {
        tally.skipped += 1;
        continue;
      }
      const token = artThumbs.artToken(url);
      try {
        const missing = [];
        for (const width of artThumbs.THUMB_WIDTHS) {
          if (!(await exists(deps.bucket, artThumbs.thumbObjectPath(token, width)))) missing.push(width);
        }
        if (!missing.length) {
          tally.complete += 1;
          continue;
        }
        const original = await deps.fetchOriginal(url);
        await artThumbs.buildThumbs(deps.bucket, token, original, missing);
        tally.built += missing.length;
      } catch (error) {
        tally.failed += 1;
        console.log(`::warning::Thumbnails not built for ${url.slice(STORAGE_PREFIX.length).split('?')[0]}: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return tally;
}

async function main() {
  const site = (process.argv[2] || 'https://siegelingstcgtesting.web.app').replace(/\/$/, '');
  const admin = require('firebase-admin');
  admin.initializeApp({ storageBucket: BUCKET });
  const bucket = admin.storage().bucket();
  const fetchOk = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${response.status} from ${url.split('?')[0]}`);
    return response;
  };
  const t0 = Date.now();
  const tally = await run({
    bucket,
    fetchCatalog: async () => (await fetchOk(`${site}/api/game/options`)).json(),
    fetchOriginal: async (url) => Buffer.from(await (await fetchOk(url)).arrayBuffer()),
    now: () => Date.now()
  });
  console.log(`Card art thumbnails in ${Math.round((Date.now() - t0) / 1000)}s: ${tally.art} art files, `
    + `${tally.complete} already complete, ${tally.built} thumbnails built, ${tally.failed} failed, ${tally.skipped} skipped (time budget)`);
}

if (require.main === module) {
  main().catch((error) => {
    console.log(`::warning::Card art thumbnail build did not run: ${error.message}`);
  });
}

module.exports = { run, artUrlsFromCatalog };
