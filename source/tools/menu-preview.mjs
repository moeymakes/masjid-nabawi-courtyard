// Menu preview: a real GPU frame of the teaser behind the menu, then the page's own menu markup and CSS laid
// over that frame in a plain browser (headless page screenshots of a WebGPU page come out white).
//   node tools/menu-preview.mjs ../index.html --out ../verify/menu [--storage key=value ...]
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2), file = path.resolve(argv[0]);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = path.resolve(opt('out', 'menu-out')); mkdirSync(out, { recursive: true });
const seeds = argv.flatMap((a, i) => (a === '--storage' && argv[i + 1] ? [argv[i + 1].split('=')] : []));
const sizes = [['phone', 844, 390], ['tablet', 1024, 768], ['desktop', 1920, 1080]];
const chrome = process.env.CHROME || '/usr/bin/google-chrome-stable';
const errors = [];
const profile = path.join(out, '.chrome-profile'); rmSync(profile, { recursive: true, force: true });
const gpu = await chromium.launch({ executablePath: chrome, ignoreDefaultArgs: true, args: ['--remote-debugging-pipe', '--no-first-run', '--user-data-dir=' + profile,
  '--headless=new', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--window-size=1920,1080', 'about:blank'] });
const plain = await chromium.launch({ executablePath: chrome, headless: true });
const html = readFileSync(file, 'utf8').replace(/<script>[\s\S]*<\/script>/, '<script>document.body.className="m";document.getElementById("d").focus()</script>');
for (const [name, W, H] of sizes) {
  const pg = await (gpu.contexts()[0] || await gpu.newContext()).newPage();
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  pg.on('pageerror', (e) => errors.push(`${name}: pageerror ${e.message}`));
  await pg.setViewportSize({ width: W, height: H });
  await pg.addInitScript({ path: path.join(here, 'grab-shim.js') });
  if (seeds.length) await pg.addInitScript((kv) => { for (const [k, v] of kv) localStorage.setItem(k, v); }, seeds);
  await pg.goto('file://' + file);
  await pg.waitForFunction(() => /\b(m|e)\b/.test(document.body.className), null, { timeout: 180000 });
  const frames = [];
  for (const wait of [3000, 9000]) { await pg.waitForTimeout(wait); const g = await pg.evaluate(() => window.__grab()); frames.push(g.url); }
  const tagline = await pg.evaluate(() => document.getElementById('t').textContent);
  await pg.close();
  frames.forEach((u, i) => writeFileSync(path.join(out, `${name}-scene-${i}.png`), Buffer.from(u.split(',')[1], 'base64')));
  const p2 = await plain.newPage({ viewport: { width: W, height: H } });
  await p2.setContent(html.replace('</style>', `canvas{display:none}body{background:url(${frames[1]}) center/cover}</style>`).replace(/(<p id=t>)[^<]*/, `$1${tagline}`));
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: path.join(out, `${name}.png`) });
  await p2.close();
  console.log(`${name} ${W}x${H}: ok`);
}
await gpu.close(); await plain.close(); rmSync(profile, { recursive: true, force: true });
writeFileSync(path.join(out, 'errors.txt'), errors.join('\n'));
console.log(`console errors: ${errors.length}`); if (errors.length) console.log(errors.join('\n'));
