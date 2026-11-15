// ============================================================================
// development tools: only in dev.html (npm run build:dev), never in index.html
// ============================================================================
//   P    fly the camera along the scripted path (FLY in world.js), one minute through the whole world
//   (F is taken: it toggles flight in the scene)
//   B    the same flight as a benchmark: the resolution stays fixed, every frame is timed, the result is shown at the end
//   P, B or 1-6 during a flight stop it
//   #capture in the URL holds full resolution (dynamic resolution off) for the critic's stills, and sets the
//   umbrellas per viewpoint: half-way through opening at 1, open at 2-6. P and B start them closed and open them.
{
  const LOGN = 1 << 16, logFrame = new Float32Array(LOGN), logGpu = new Float32Array(LOGN);
  let flying = false, bench = false, last = 0, nFrame = 0, nGpu = 0;
  const stop = () => { flying = bench = false; dynT = location.hash === '#capture' ? -Infinity : 0; };
  const report = () => {
    const st = (a, n) => { const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y); let sum = 0; for (const v of s) sum += v; return { n, avg: sum / n, p99: s[min(n - 1, floor(n * 0.99))], max: s[n - 1] }; };
    const fm = (o) => `avg ${o.avg.toFixed(2)}  p99 ${o.p99.toFixed(2)}  max ${o.max.toFixed(2)} ms`;
    const f = st(logFrame, nFrame);
    info.textContent = `Fly-through ${Wpx}x${Hpx}, ${f.n} frames\nframe  ${fm(f)}\nGPU    ${nGpu ? fm(st(logGpu, nGpu)) : 'timestamp-query unavailable'}`;
  };
  // frame() moves the free camera and then calls render(): step in between and put the camera on the path instead
  const draw = render;
  render = () => {
    if (flying) {
      const dtr = F[LAST] - last; last = F[LAST];
      F[FLT] += min(dtr / 1000, 0.1); flyAt();
      if (bench) { if (nFrame < LOGN) logFrame[nFrame++] = dtr; if (F[GPU] > 0 && nGpu < LOGN) logGpu[nGpu++] = F[GPU]; }
      if (F[FLT] >= FLYT) { if (bench) report(); stop(); }
    }
    draw();
  };
  addEventListener('keydown', (e) => {
    if (menu || e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'KeyB') {
      if (flying) stop();
      else {
        flying = true; fly = true; bench = e.code === 'KeyB'; F[FLT] = 0; last = F[LAST]; nFrame = nGpu = 0;
        F[UMC] = -2; F[UMD] = 1; shadowDirty = 2;
        // a benchmark hides the stats line and holds the resolution: dynT at -Infinity keeps frame() from tuning it
        if (bench) { hud = false; info.textContent = ''; dynT = -Infinity; }
      }
    } else if (/Digit[1-6]/.test(e.code)) {
      stop();
      if (location.hash === '#capture') { F[UMC] = e.code === 'Digit1' ? 24 : UMAX; F[UMD] = 0; shadowDirty = 2; }
    }
  });
}
if (location.hash === '#capture') dynT = -Infinity;
