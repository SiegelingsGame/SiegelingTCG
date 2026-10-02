'use strict';

/* Ready-made card art thumbnails.

   Card art is uploaded as 1024x1536 PNGs of 1-2.4 MB, but no surface draws it
   wider than ~740 device px. Each upload therefore also stores WebP cuts at a
   few fixed widths, next to the art, under the art's own download token:

     art-thumbs/<token>/w<width>.webp   (readable with that same token)

   A page turns an art URL into a thumbnail URL with string handling alone, and
   every visitor - first-time or returning - downloads a small static file. No
   request ever waits on a resize. A re-upload gets a new token, so a thumbnail
   can never go stale. The art mirror stays as the fallback for anything not
   built yet, and builds what it serves. */

const THUMB_WIDTHS = [160, 240, 320, 480, 640, 960];
const THUMB_PREFIX = 'art-thumbs';
// Firebase download tokens are UUIDs. Anything else is refused, so a token can
// never steer the object path (no slashes, no dots).
const TOKEN_PATTERN = /^[0-9A-Za-z-]{8,64}$/;

function parseThumbWidth(raw) {
  const requested = Number.parseInt(String(raw || ''), 10);
  if (!Number.isFinite(requested) || requested <= 0) {
    return 0;
  }
  return THUMB_WIDTHS.find((bucket) => bucket >= requested) || THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
}

function artToken(url) {
  let token = '';
  try {
    token = new URL(String(url || '')).searchParams.get('token') || '';
  } catch (error) {
    return '';
  }
  return TOKEN_PATTERN.test(token) ? token : '';
}

function thumbObjectPath(token, width) {
  return `${THUMB_PREFIX}/${token}/w${width}.webp`;
}

function thumbDownloadUrl(bucketName, token, width) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(thumbObjectPath(token, width))}?alt=media&token=${token}`;
}

// sharp is loaded on first use, so a cold start that never resizes pays nothing.
let sharpModule = null;
async function resizeArt(buffer, width) {
  if (!sharpModule) {
    sharpModule = require('sharp');
  }
  return sharpModule(buffer)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
}

async function saveThumb(bucket, token, width, body) {
  await bucket.file(thumbObjectPath(token, width)).save(body, {
    resumable: false,
    metadata: {
      contentType: 'image/webp',
      cacheControl: 'public,max-age=31536000,immutable',
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });
}

async function readThumb(bucket, token, width) {
  try {
    const [body] = await bucket.file(thumbObjectPath(token, width)).download();
    return body;
  } catch (error) {
    if (error?.code !== 404) {
      console.warn('art thumbnail read failed', error?.message || error);
    }
    return null;
  }
}

/* Decoding one original takes ~6 MB of bitmap plus libvips working memory.
   Queueing resizes behind a few slots finishes a burst sooner on one CPU than
   running them all together, and never runs the instance out of memory. */
function createLimiter(slots) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= slots || !waiting.length) return;
    active += 1;
    const { task, resolve, reject } = waiting.shift();
    Promise.resolve().then(task).then(resolve, reject).finally(() => {
      active -= 1;
      next();
    });
  };
  return (task) => new Promise((resolve, reject) => {
    waiting.push({ task, resolve, reject });
    next();
  });
}

// Every width for one piece of art, resized from the original each time so no
// cut is a copy of a copy.
async function buildThumbs(bucket, token, original, widths = THUMB_WIDTHS) {
  for (const width of widths) {
    await saveThumb(bucket, token, width, await resizeArt(original, width));
  }
  return widths.length;
}

module.exports = {
  THUMB_WIDTHS,
  parseThumbWidth,
  artToken,
  thumbObjectPath,
  thumbDownloadUrl,
  resizeArt,
  saveThumb,
  readThumb,
  createLimiter,
  buildThumbs
};
