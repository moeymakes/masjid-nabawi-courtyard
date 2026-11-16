// ============================================================================
// quality level, chosen before anything is built (pattern from Abyssal Garden, MIT)
// ============================================================================
// LV: 0 High, 1 Medium, 2 Low. Medium and Low keep every 2nd / 4th frond and grass blade and use a smaller shadow map;
// Low also drops anti-aliasing and uses coarser meshes and fewer light shaft steps.
// localStorage.nabawi = "level,pixels,detail". nabawiLoad is set while the world is built: still set on the
// next visit means that load crashed the tab, so this one runs a level lower.
const mob = matchMedia('(pointer:coarse)').matches, mem = navigator.deviceMemory;
const keep = (k, v) => { try { localStorage[k] = v; } catch {} };
let SV = [], LV, bad;
try { SV = (localStorage.nabawi || '').split(','); bad = localStorage.nabawiLoad; } catch {}
LV = SV[0] ? +SV[0] : mob ? (mem > 7 ? 1 : 2) : mem <= 4 ? 2 : 0;
if (bad && LV < 2) { SV = [++LV]; keep('nabawi', LV); }
const THIN = 1 << LV, SHADOW = LV ? 2048 : 4096, AA = LV > 1 ? 1 : 4, RAYN = LV > 1 ? 10 : 24;
// time of day (worldsmith references/time-of-day.md): 0 dawn after Fajr, 1 golden hour, 2 night with lights.
// Every bake depends on the sun, so changing it reloads the page.
let TOD = 0;
try { const t = localStorage.nabawiTime; if (t === '0' || t === '1' || t === '2') TOD = +t; } catch {}
const TP = [
  { sun: [.97, .16, .18], sunc: [3.5, 2.25, 1.15], zen: [.07, .21, .60], cool: [.68, .72, .82], warm: [1.40, .90, .50], band: [1, .5, .2], rose: [.30, .10, .12], gnd: 1, farblue: [.64, .68, .78], ambc: [1, 1, 1], cloud: 1, expo: .52, rays: 1, lights: 1, litf: .9, night: 0, birds: 1 },
  { sun: [-.95, .17, .25], sunc: [3.4, 2.3, 1.35], zen: [.10, .24, .58], cool: [.74, .68, .66], warm: [1.35, .84, .44], band: [1, .5, .2], rose: [.16, .07, .07], gnd: 1, farblue: [.62, .64, .72], ambc: [1.04, .96, .86], cloud: 1, expo: .5, rays: 1, lights: 1.2, litf: .84, night: 0, birds: .8 },
  { sun: [.45, .62, .64], sunc: [.17, .2, .29], zen: [.004, .008, .022], cool: [.025, .03, .045], warm: [.06, .05, .055], band: [.32, .17, .07], rose: [0, 0, 0], gnd: .06, farblue: [.03, .035, .05], ambc: [.045, .05, .07], cloud: .03, expo: 1.8, rays: 0, lights: 4, litf: .35, night: 1, birds: .15 },
][TOD];
