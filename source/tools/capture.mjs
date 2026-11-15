// Headless capture + benchmark for a single-file WebGPU world (verification gates 1 and 2).
// Copy to <project>/source/tools/capture.mjs together with grab-shim.js; needs `npm i -D playwright-core`.
// Uses the system Chrome (not Playwright's bundled headless shell, which has no WebGPU on this machine).
//
//   node tools/capture.mjs ../dev.html --out ../verify/iter-01 --size 2560x1440            six pose stills
//   node tools/capture.mjs ../dev.html --out ../verify/iter-01 --flight 60 --frames 24     + fly-through frames
//   node tools/capture.mjs ../dev.html --out ../verify/iter-01 --bench 60                  + benchmark report
//   flags combine; --poses 0 skips stills; --chrome /path overrides the browser; --settle ms per pose (2000);
//   --flight-key KeyP when the world uses F for itself (e.g. a walk/fly toggle);
//   --storage key=value seeds localStorage before load (e.g. --storage madinah=2 to test the Low level)
//
// Page contract (the skill's template follows it; Abyssal Garden's index.html does too):
//   body.className  'l' loading · 'm' menu · 'g' in the scene · 'l e' failed (message in #s)
//   #d  the dive / start button          #i  stats text (KeyH toggles it)
//   Digit1..Digit6  jump to the fixed poses
//   dev.html only: KeyF (or --flight-key) scripted flight, KeyB benchmark (report written into #i, starting "Fly-through")
//   dev.html only: location.hash '#capture' holds full resolution (dynamic resolution off)
//
// Outputs in --out: pose-N.png, flight-NN.png, flight-sheet.jpg, flight.mp4, perf.txt, run.json
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const file = argv[0];
if (!file || file.startsWith('--')) { console.error('usage: node capture.mjs <page.html> [--out dir] [--size WxH] [--poses n] [--flight s --frames n] [--bench s]'); process.exit(2); }
const out = path.resolve(opt('out', 'capture-out'));
const [W, H] = opt('size', '2560x1440').split('x').map(Number);
const nPoses = +opt('poses', 6), settle = +opt('settle', 2000), flight = +opt('flight', 0), nFrames = +opt('frames', 24), bench = +opt('bench', 0);
const flightKey = opt('flight-key', 'KeyF');
const chrome = opt('chrome', process.env.CHROME || '/usr/bin/google-chrome-stable');
mkdirSync(out, { recursive: true });
const profile = path.join(out, '.chrome-profile'); rmSync(profile, { recursive: true, force: true });

const browser = await chromium.launch({
  executablePath: chrome,
  ignoreDefaultArgs: true, // Playwright's defaults force SwiftShader; pass Chrome's flags ourselves
  args: ['--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile,
    '--headless=new', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface',
    '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`, 'about:blank'],
});
const ctx = browser.contexts()[0] || await browser.newContext();
const page = await ctx.newPage();
await page.setViewportSize({ width: W, height: H });
await page.addInitScript({ path: path.join(here, 'grab-shim.js') });
const seed = opt('storage', '');
if (seed) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { localStorage.setItem(k, v); sessionStorage.seeded = 1; } }, seed.split('='));
const run = { file: path.resolve(file), size: `${W}x${H}`, errors: [], warnings: [], shots: [] };
page.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text()); else if (m.type() === 'warning') run.warnings.push(m.text()); });
page.on('pageerror', (e) => run.errors.push('pageerror: ' + e.message));
const save = (name, g) => { writeFileSync(path.join(out, name), Buffer.from(g.url.split(',')[1], 'base64')); run.shots.push(`${name} ${g.w}x${g.h}`); return g; };
const grab = async () => page.evaluate(() => Promise.race([window.__grab(), new Promise((_, j) => setTimeout(() => j(new Error('no frame submitted in 10 s')), 1e4))]));
const hud = () => page.evaluate(() => document.getElementById('i')?.textContent || '');

const url = 'file://' + path.resolve(file) + (file.includes('dev') ? '#capture' : '');
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => /\b(m|e)\b/.test(document.body.className), null, { timeout: 180000 });
run.loadMs = Date.now() - t0;
run.adapter = await page.evaluate(() => window.__gpuInfo || 'none requested');
run.status = await page.evaluate(() => `${document.body.className} | ${document.getElementById('s')?.textContent}`);
console.log(`adapter: ${run.adapter}\nload: ${run.loadMs} ms  state: ${run.status}`);
if (/\be\b/.test(run.status.split('|')[0])) { writeFileSync(path.join(out, 'run.json'), JSON.stringify(run, null, 2)); await browser.close(); console.error('page failed to start'); process.exit(1); }
if (/swiftshader|fallback=true/i.test(run.adapter)) console.warn('WARNING: software adapter - frame times and look are not representative');

await page.click('#d');
await page.waitForTimeout(1500);
await page.keyboard.press('KeyH'); // stats on: lets the run log fps / GPU ms per pose
for (let i = 1; i <= nPoses; i++) {
  await page.keyboard.press('Digit' + i);
  await page.waitForTimeout(settle);
  const g = save(`pose-${i}.png`, await grab());
  const h = await hud(); run[`pose${i}`] = h;
  console.log(`pose ${i}: ${g.w}x${g.h}  ${h}`);
  if (g.w < W * 0.98) console.warn(`  pose ${i} rendered at ${g.w}x${g.h}, below the ${W}x${H} viewport (dynamic resolution) - use dev.html for full-res shots`);
}
if (flight) {
  await page.keyboard.press(flightKey);
  const dt = flight * 1000 / nFrames;
  for (let k = 0; k < nFrames; k++) {
    const t = Date.now();
    save(`flight-${String(k).padStart(2, '0')}.png`, await grab());
    await page.waitForTimeout(Math.max(0, dt - (Date.now() - t)));
  }
  await page.keyboard.press(flightKey); // stop the flight
  try {
    execFileSync('montage', [path.join(out, 'flight-*.png'), '-tile', '6x', '-geometry', '640x360+4+4', '-background', '#111', path.join(out, 'flight-sheet.jpg')]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '4', '-pattern_type', 'glob', '-i', path.join(out, 'flight-*.png'), '-vf', 'scale=1280:-2', '-pix_fmt', 'yuv420p', path.join(out, 'flight.mp4')]);
  } catch (e) { console.warn('montage/ffmpeg step failed: ' + e.message.split('\n')[0]); }
}
if (bench) {
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyB');
  await page.waitForFunction(() => (document.getElementById('i')?.textContent || '').startsWith('Fly-through'), null, { timeout: (bench + 60) * 1000 });
  run.bench = await hud();
  writeFileSync(path.join(out, 'perf.txt'), `${run.bench}\n\nadapter: ${run.adapter}\nviewport: ${W}x${H}\n`);
  console.log(run.bench);
}
writeFileSync(path.join(out, 'run.json'), JSON.stringify(run, null, 2));
if (run.errors.length) console.log(`console errors (${run.errors.length}):\n  ` + run.errors.slice(0, 10).join('\n  '));
await browser.close();
rmSync(profile, { recursive: true, force: true });
