#!/usr/bin/env node
/**
 * Record the Siegelings promo cinematic to MP4 (extended w/ gameplay).
 * Serves static/, drives promo.html?record=1 in Chrome, grabs frames,
 * then stitches + muxes a battle-theme excerpt with system ffmpeg.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

let chromium;
try {
  chromium = require('/tmp/promo-pw/node_modules/playwright').chromium;
} catch (_) {
  try {
    chromium = require('/opt/node22/lib/node_modules/playwright').chromium;
  } catch (err) {
    chromium = require('playwright').chromium;
  }
}

const ROOT = path.resolve(__dirname, '../..');
const STATIC = path.join(ROOT, 'src/main/resources/static');
const OUT_DIR = path.join(STATIC, 'video');
const ARTIFACT_DIR = '/opt/cursor/artifacts';
const TMP = '/tmp/siegelings-promo-record';
const FRAMES = path.join(TMP, 'frames');
const PORT = 8942;
const W = 1920;
const H = 1080;
const FPS = 20;
const DURATION_S = 24;
const FRAME_COUNT = FPS * DURATION_S;
const BATTLE_THEME = path.join(STATIC, 'audio/battle/sieglings-battle-theme-2.mp3');
// Loudest sustained epic window from energy scan of battle-theme-2.
const AUDIO_START_S = '220';

function mime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.woff2': 'font/woff2'
  })[ext] || 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = urlPath === '/' ? '/promo.html' : urlPath;
    const filePath = path.join(STATIC, rel);
    if (!filePath.startsWith(STATIC) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('missing');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime(filePath), 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr || r.stdout}`);
  }
  return r;
}

function pad(n) {
  return String(n).padStart(5, '0');
}

async function waitReady(page) {
  await page.waitForFunction(() => typeof window.__promoPlay === 'function', null, { timeout: 20000 });
  await page.evaluate(async () => {
    const urls = Array.from(document.querySelectorAll('.art-plate')).map((el) => {
      const raw = getComputedStyle(el).getPropertyValue('--art').trim();
      return raw.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    });
    await Promise.all(urls.map((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = src;
    })));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const audioClip = path.join(TMP, 'promo-audio-battle.mp3');
  const fadeOutStart = Math.max(0.5, DURATION_S - 1.5);
  run('ffmpeg', [
    '-y', '-ss', AUDIO_START_S, '-i', BATTLE_THEME,
    '-t', String(DURATION_S),
    '-af', `afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOutStart}:d=1.45,loudnorm=I=-12:TP=-1.2:LRA=10`,
    '-c:a', 'libmp3lame', '-b:a', '192k', audioClip
  ]);

  const server = await startServer();
  const bundled = '/opt/pw-browsers/chromium';
  const systemChrome = '/opt/google/chrome/google-chrome';
  const launchOpts = {
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage']
  };
  if (fs.existsSync(bundled)) launchOpts.executablePath = bundled;
  else if (fs.existsSync(systemChrome)) launchOpts.executablePath = systemChrome;
  else launchOpts.channel = 'chrome';

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  await page.goto(`http://127.0.0.1:${PORT}/promo.html?record=1`, { waitUntil: 'networkidle' });
  await waitReady(page);
  await page.waitForFunction(() => typeof window.__promoSeek === 'function');

  const frameIntervalMs = 1000 / FPS;
  for (var i = 0; i < FRAME_COUNT; i++) {
    const ms = Math.min(DURATION_S * 1000, Math.round(i * frameIntervalMs));
    await page.evaluate((t) => window.__promoSeek(t), ms);
    // Two rAFs so canvas sparks + layout settle before the capture.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const file = path.join(FRAMES, `frame-${pad(i)}.png`);
    await page.screenshot({ path: file, type: 'png' });
    if (i % 30 === 0) process.stderr.write(`frame ${i}/${FRAME_COUNT} @ ${ms}ms\n`);
  }

  await browser.close();
  server.close();

  const finalMp4 = path.join(OUT_DIR, 'siegelings-promo.mp4');
  const artifactMp4 = path.join(ARTIFACT_DIR, 'siegelings-promo.mp4');
  run('ffmpeg', [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES, 'frame-%05d.png'),
    '-i', audioClip,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-t', String(DURATION_S),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-shortest',
    finalMp4
  ]);
  fs.copyFileSync(finalMp4, artifactMp4);

  const poster = path.join(OUT_DIR, 'siegelings-promo-poster.webp');
  const posterArt = path.join(ARTIFACT_DIR, 'siegelings-promo-poster.webp');
  run('ffmpeg', [
    '-y', '-ss', '21.4', '-i', finalMp4,
    '-frames:v', '1', poster
  ]);
  fs.copyFileSync(poster, posterArt);

  // Beat stills: open, collect, battle clash, siege hand, end card.
  ['00000', '00090', '00210', '00350', '00440'].forEach((id, idx) => {
    const src = path.join(FRAMES, `frame-${id}.png`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(ARTIFACT_DIR, `promo-beat-${idx + 1}.png`));
    }
  });

  const probe = run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate',
    '-of', 'json',
    finalMp4
  ]);
  console.log(JSON.stringify({
    ok: true,
    out: finalMp4,
    artifact: artifactMp4,
    poster,
    bytes: fs.statSync(finalMp4).size,
    probe: JSON.parse(probe.stdout)
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
