// Bundles source/src/*.js into ONE self-contained ../index.html (no external files of any kind).
// Copy this file to <project>/source/build.mjs. Adapted from Abyssal Garden's build.mjs (MIT, see reference-impl).
//
//   node build.mjs              minified ../index.html, prints raw + gzipped size
//   node build.mjs --readable   unminified ../index.html (debug in DevTools with real names)
//   node build.mjs --dev        ../dev.html: unminified + src/dev.js (scripted fly-through F, benchmark B,
//                               capture mode). dev.html is never shipped.
//
// Conventions the rest of the skill relies on:
//   - every src file is plain script code that shares ONE scope (no import/export); FILES order is load order
//   - WGSL lives in template literals tagged /*wgsl*/`...` so it can be minified separately
//   - template.html contains the marker /*SCRIPT*/ inside its <script> tag
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
// EDIT THIS: concatenation order matters (constants -> helpers -> shaders -> world -> renderer -> audio)
const FILES = ['quality.js', 'math.js', 'world.js', 'shaders.js', 'main.js', 'audio.js'];
const dev = process.argv.includes('--dev'), readable = dev || process.argv.includes('--readable');
const out = dev ? 'dev.html' : 'index.html';
const files = dev && existsSync(path.join(here, 'src', 'dev.js')) ? [...FILES, 'dev.js'] : FILES;

let js = files.map((f) => `// ---- ${f}\n` + readFileSync(path.join(here, 'src', f), 'utf8')).join('\n');
const tpl = readFileSync(path.join(here, 'template.html'), 'utf8');
// Everything runs inside one async function (top-level await for adapter/device/readbacks).
// A startup error is shown on screen instead of leaving a black page: body class 'l e' = failed.
const wrap = (body) => `(async()=>{${body}\n})().catch(e=>{console.error(e);document.body.className='l e';document.getElementById('s').textContent=(e.cause?'':'Failed to start: ')+e.message});`;

let html;
if (readable) {
  html = tpl.replace('/*SCRIPT*/', () => wrap(js));
} else {
  // WGSL: strip // comments, collapse whitespace, drop spaces around punctuation. Never put a `//` URL or a
  // backtick inside WGSL, and never rely on whitespace to separate two operators (write `a - (-b)`, not `a - -b`).
  const minWgsl = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').replace(/ ?([{}()\[\];,:=+\-*\/<>&|!%@]) ?/g, '$1').trim();
  js = js.replace(/\/\*wgsl\*\/`([^`]*)`/g, (_, w) => '`' + minWgsl(w) + '`');
  const code = transformSync(wrap(js), { minify: true, target: 'es2022', legalComments: 'none' }).code.trim();
  const css = (_, s) => '<style>' + transformSync(s, { loader: 'css', minify: true }).code.trim();
  html = tpl.replace(/<style>([^]*?)(?=<\/style>)/, css).replace(/>\s+</g, '><').replace('/*SCRIPT*/', () => code)
    .replace(/<script>\s+/, '<script>').replace(/\s+<\/script>/, '</script>');
}
writeFileSync(path.join(here, '..', out), html);
const gz = gzipSync(Buffer.from(html), { level: 9 }).length;
console.log(`${out}: ${(html.length / 1024).toFixed(1)} kB${readable ? ' (readable)' : ''}, ${(gz / 1024).toFixed(1)} kB gzipped`);
