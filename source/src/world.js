// ============================================================================
// world layout + procedural content generation (load time only)
// ============================================================================
// Axes: +x east, -z north, y up, metres; the plaza floor is y = 0. The scene is the east plaza of the Prophet's
// Mosque: its east facade runs north-south along x = FAC, the umbrella field fills the plaza, a free-standing
// arcade and a palm bed close it to the east. Distances are composed and compressed, not to scale.

// sun 9 degrees up in the east-south-east: just after sunrise, straight onto the east facade
const SUN = (() => { const v = [.97, .16, .18]; const l = hypot(...v); return v.map((c) => c / l); })();
const FAC = -90, MZ0 = -210, MZ1 = 200, MX0 = -330, ROOF = 19;
// umbrella field: columns at x0 + i*sp, z0 + j*sp; they open as a wave spreading from the main gate
const UX0 = -72, UZ0 = -237, USP = 27, UNX = 6, UNZ = 18, UGATE = [-88, -20];
// east gates: z centre, width, height, main
const GATES = [[-20, 16, 18.5, 1], [-128, 10, 13.5, 0], [88, 10, 13.5, 0]];
// Saudi-era minarets (about 100 m): the four on the east side are close to the plaza, the rest frame the roof
const MINS = [[FAC, MZ0], [FAC, MZ1], [FAC + 1, -50], [FAC + 1, 10], [MX0, MZ0], [MX0, MZ1], [-232, MZ0], [-180, MZ0]];
const GREEN = [-116, 128], OLDMIN = [-101, 157];
const ARCX = [92, 100], ARCZ = [-224, 216];
const BED = [103, 131, -226, 220];
// viewpoints: x, eye height above the floor (absolute y when flying), z, look-at x, y, z, flying
const POSES = [
  [45, 1.7, 28, -116, 30, 128, 0],
  [-64, 1.7, -6, -89, 56, 10, 0],
  [-60, 1.7, -96, 100, 9, -66, 0],
  [96, 1.7, -150, 96.3, 3.3, 0, 0],
  [-52, 1.7, -12, -90, 8.5, -20, 0],
  [150, 115, -175, -120, 18, 80, 1],
];
// 60 s scripted camera path (position + look-at, absolute heights), along the lanes between the columns
const FLY = new Float32Array([
  76.5, 3.5, 100, -116, 32, 128,
  22.5, 3.5, 73.5, -116, 32, 128,
  -4.5, 3, 30, -90, 10, -20,
  -58.5, 2.8, -8, -90, 9, -20,
  -70, 3, 0, -89, 60, 10,
  -58.5, 4, 30, -40, 8, 120,
  -58.5, 4, 100.5, 0, 6, 140,
  -31.5, 4, 114, 40, 5, 140,
  -4.5, 4, 122, 96, 4, 140,
  76.5, 3.5, 124.5, 96, 3, 123.5,
  84, 3, 123.5, 100, 3, 120,
  92.5, 3, 123.5, 100, 3, 110,
  96, 3, 115, 96, 3, 0,
  96, 3, 100, 96, 3, 0,
  96, 3, -40, 130, 5, -60,
  96, 3, -47, 60, 4, -55,
  92.5, 3.2, -51.5, 60, 5, -60,
  86, 4, -53, 60, 6, -70,
  82, 8, -90, -90, 30, -60,
  84, 30, -140, -120, 20, 60,
  40, 60, -165, -120, 20, 60,
  150, 115, -175, -120, 18, 80,
]);
const FLYR = 360, FLYH = 150;
const LANT = [], GATEDOME = [];

// ---------------------------------------------------------------- far landscape: polar grid out to 12 km
const FN = 1024, FC = 24000 / (FN - 1), FO = -12000;
function farSampler(FA) {
  return (x, z) => {
    const gx = clamp((x - FO) / FC, 0, FN - 1.001), gz = clamp((z - FO) / FC, 0, FN - 1.001), ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz;
    const i = (ix + FN * iz) * 4;
    return mix(mix(FA[i], FA[i + 4], fx), mix(FA[i + FN * 4], FA[i + FN * 4 + 4], fx), fz);
  };
}
// the floor slab covers |x|,|z| < FLOORH; far ground inside it sinks below the floor
const FLOORH = 420;
function buildFar(fh) {
  const NR = 220, NS = 768, R0 = 400, R1 = 12000, nv = NR * NS;
  const vb = new ArrayBuffer(nv * 16), vf = new Float32Array(vb), v8 = new Int8Array(vb);
  const sx = SUN[0], sy = SUN[1], sz = SUN[2], sl = hypot(sx, sz), tn = sy / sl;
  for (let r = 0; r < NR; r++) {
    const rad = R0 * pow(R1 / R0, r / (NR - 1));
    for (let s = 0; s < NS; s++) {
      const a = (s + (r & 1) * .5) / NS * TAU, x = cos(a) * rad, z = sin(a) * rad, k = r * NS + s;
      let h = fh(x, z);
      if (max(abs(x), abs(z)) < FLOORH - 2) h -= 2;
      const e = max(FC * .7, rad * .004);
      let nx = fh(x - e, z) - fh(x + e, z), ny = 2 * e, nz = fh(x, z - e) - fh(x, z + e); const l = hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      let sh = 1;
      for (let t = 25; t < 3600; t *= 1.09) { const c = h + 2 + t * tn - fh(x + sx / sl * t, z + sz / sl * t); if (c < 0) { sh = 0; break; } sh = min(sh, c / (t * .045)); }
      vf[k * 4] = x; vf[k * 4 + 1] = h; vf[k * 4 + 2] = z;
      v8[k * 16 + 12] = round(nx * 127); v8[k * 16 + 13] = round(ny * 127); v8[k * 16 + 14] = round(nz * 127); v8[k * 16 + 15] = round(clamp(sh, 0, 1) * 127);
    }
  }
  const ib = [];
  for (let r = 0; r < NR - 1; r++) for (let s = 0; s < NS; s++) {
    const a = r * NS + s, b = r * NS + (s + 1) % NS, c = (r + 1) * NS + s, d = (r + 1) * NS + (s + 1) % NS;
    if (r & 1) ib.push(a, c, b, b, c, d); else ib.push(a, c, d, a, d, b);
  }
  return { vb, ib: new Uint32Array(ib), nv };
}

// ---------------------------------------------------------------- mesh toolkit
// a planar convex polygon with its own vertices, wound so its normal faces n
const face = (m, pts, n, aux = 1) => {
  const a = pts[0], b = pts[1], c = pts[2];
  const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0, v = pts.map((p) => m.v(p[0], p[1], p[2], aux));
  if (flip) v.reverse();
  for (let i = 1; i < v.length - 1; i++) m.tri(v[0], v[i], v[i + 1]);
};
const box = (m, x0, y0, z0, x1, y1, z1, aux = 1) => {
  const P = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  face(m, [P(0), P(2), P(6), P(4)], [-1, 0, 0], aux); face(m, [P(1), P(3), P(7), P(5)], [1, 0, 0], aux);
  face(m, [P(0), P(1), P(5), P(4)], [0, -1, 0], aux); face(m, [P(2), P(3), P(7), P(6)], [0, 1, 0], aux);
  face(m, [P(0), P(1), P(3), P(2)], [0, 0, -1], aux); face(m, [P(4), P(5), P(7), P(6)], [0, 0, 1], aux);
};
// surface of revolution: prof = [[radius, height, ao]...] bottom to top, seg sides (8 = octagonal)
function lathe(m, prof, seg, cx = 0, cy = 0, cz = 0, rot = PI / seg) {
  const rings = [];
  for (const [r, h, ao = 1] of prof) { const ring = []; for (let s = 0; s < seg; s++) { const a = s / seg * TAU + rot; ring.push(m.v(cx + cos(a) * r, cy + h, cz + sin(a) * r, ao)); } rings.push(ring); }
  for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < seg; s++) { const s2 = (s + 1) % seg; m.quad(rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]); }
}
// drum + slightly pointed dome of radius r standing on height y
const domeProf = (r, drum, point = 1.12) => {
  const p = [[r * 1.04, 0], [r * 1.04, drum], [r * 1.08, drum + .2], [r, drum + .35]];
  for (let i = 1; i <= 14; i++) { const a = i / 14 * PI / 2; p.push([r * cos(a), drum + .35 + r * point * pow(sin(a), .92)]); }
  return p;
};
// two-centred pointed arch from (a0, ys) over to (a1, ys): rho = arc radius as a fraction of the span
const pointed = (a0, a1, ys, rho, n = 8) => {
  const w = a1 - a0, R = rho * w, ta = Math.acos((R - w / 2) / R), L = [], Rr = [];
  for (let k = 0; k <= n; k++) { const t = k / n * ta; L.push([a0 + R - R * cos(t), ys + R * sin(t)]); Rr.push([a1 - R + R * cos(t), ys + R * sin(t)]); }
  return L.concat(Rr.reverse().slice(1));
};
// a wall panel [u0,u1] x [yb,yt] in a vertical plane with a pointed-arch opening [a0,a1] from sill y0, springing
// ys; P(u, y, d) maps plane coordinates (d along the outward normal) to world space. The opening's reveal goes
// `depth` deep; fill (a mesh) closes its back with a screen or doors.
function archPanel(m, P, nrm, u0, u1, yb, yt, a0, a1, y0, ys, rho, depth, fill, soffit = true) {
  const arc = pointed(a0, a1, ys, rho, 8), N = (u, y, d = 0) => P(u, y, d), p0 = P(0, 0, 0), p1 = P(1, 0, 0), uN = [p1[0] - p0[0], 0, p1[2] - p0[2]];
  const W = (pts, d = 0) => pts.map(([u, y]) => N(u, y, d));
  face(m, W([[u0, yb], [a0, yb], [a0, ys], [u0, ys]]), nrm);
  face(m, W([[a1, yb], [u1, yb], [u1, ys], [a1, ys]]), nrm);
  if (y0 > yb) face(m, W([[a0, yb], [a1, yb], [a1, y0], [a0, y0]]), nrm);
  const am = (a0 + a1) / 2, half = arc.length >> 1;
  for (let k = 0; k < arc.length - 1; k++) {
    const p = arc[k], q = arc[k + 1];
    const tu = (u) => (u <= am ? mix(u0, am, (u - a0) / (am - a0)) : mix(am, u1, (u - am) / (a1 - am)));
    face(m, W([p, q, [tu(q[0]), yt], [tu(p[0]), yt]]), nrm);
    if (k === 0) face(m, W([[u0, ys], p, [u0, yt]]), nrm);
    if (k === arc.length - 2) face(m, W([q, [u1, ys], [u1, yt]]), nrm);
  }
  if (soffit) {
    const out = [[a0, y0], ...arc, [a1, y0]], cu = am, cy = ys;
    for (let k = 0; k < out.length - 1; k++) {
      const p = out[k], q = out[k + 1];
      let nu = -(q[1] - p[1]), ny = q[0] - p[0];
      if (nu * (cu - p[0]) + ny * (cy - p[1]) < 0) { nu = -nu; ny = -ny; }
      const l = hypot(nu, ny), dn = [uN[0] * nu / l, ny / l, uN[2] * nu / l];
      face(m, [N(p[0], p[1], 0), N(q[0], q[1], 0), N(q[0], q[1], -depth), N(p[0], p[1], -depth)], dn, k === 0 || k === out.length - 2 ? .8 : .7);
    }
  }
  if (fill) face(fill, W([[a0, y0], ...arc, [a1, y0]], -depth), nrm);
}
// merlons (stepped crenellations) along a straight roof edge
function merlons(m, x0, z0, x1, z1, y, sp = 1.5) {
  const L = hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  for (let t = sp / 2; t < L; t += sp) {
    const cx = x0 + ux * t, cz = z0 + uz * t, a = abs(ux) > .5;
    const d = .2;
    for (const [w, h0, h1] of [[.4, 0, .5], [.27, .5, .82], [.15, .82, 1.1]]) {
      if (a) box(m, cx - w, y + h0, cz - d, cx + w, y + h1, cz + d); else box(m, cx - d, y + h0, cz - w, cx + d, y + h1, cz + w);
    }
    lathe(m, [[.2, 1.1], [0, 1.38]], 4, cx, y, cz, PI / 4);
  }
}
// Saudi-era minaret: square shaft to above the roof, three octagonal stages on corbelled balconies, a lantern, a cap
const MINARET_N = [[3.3, 22], [3.3, 34.6], [3.55, 34.8], [3.55, 35.5], [3.3, 35.7], [3.3, 48.4], [4.5, 50.4], [4.5, 52.2], [3, 52.5], [3, 59.2], [3.22, 59.4], [3.22, 60], [3, 60.2], [3, 66.6], [4.1, 68.4], [4.1, 70.2], [2.5, 70.5], [2.5, 74.4], [2.7, 74.6], [2.7, 75.1], [2.5, 75.3], [2.5, 78.8], [3.5, 80.4], [3.5, 81.9], [2.1, 82.2], [2.1, 86], [2.4, 86.2], [2.25, 87.8], [1.3, 89.8], [.3, 91.3], [0, 91.5]];
const MINARET_O = [[2.6, 19], [2.6, 39.6], [3.4, 41.4], [3.4, 42.6], [2.2, 42.9], [2.2, 51.6], [2.9, 53], [2.9, 54], [1.8, 54.3], [1.8, 58], [2.1, 59], [2.15, 60.4], [1.7, 62.2], [.9, 63.6], [.15, 64.4], [0, 64.5]];
const MK = 1.09;
function meshMinaret(prof, base, baseH, k = 1) {
  const m = new Mesh();
  box(m, -base * .6, 0, -base * .6, base * .6, 1.6, base * .6, .8);
  box(m, -base / 2, 1.6, -base / 2, base / 2, baseH, base / 2);
  box(m, -base / 2 - .25, baseH - 1.2, -base / 2 - .25, base / 2 + .25, baseH - .5, base / 2 + .25);
  lathe(m, prof.map(([r, h]) => [r * k, h * k]), 8);
  return m;
}
// alem: a short pole with stacked spheres and an upturned crescent on top (checked in silhouette: no cross)
function meshFinial(s) {
  const m = new Mesh(), ball = (y, r) => { const p = []; for (let i = 0; i <= 8; i++) { const a = -PI / 2 + i / 8 * PI; p.push([cos(a) * r, y + r + sin(a) * r]); } return p; };
  lathe(m, [[.15 * s, 0], [.15 * s, .9 * s], [.1 * s, .9 * s]], 10);
  lathe(m, ball(.9 * s, .34 * s), 12); lathe(m, ball(1.55 * s, .24 * s), 12);
  lathe(m, [[.07 * s, 2 * s], [.07 * s, 2.35 * s], [0, 2.36 * s]], 8);
  const R = .55 * s, cy = 2.3 * s + R * .95, pts = [];
  for (let k = 0; k <= 16; k++) { const a = (200 + k / 16 * 140) * PI / 180; pts.push([cos(a) * R, cy + sin(a) * R, 0]); }
  m.tube(pts, (k) => .015 * s + .1 * s * sin(PI * k / 16), 6, false, () => 1);
  return m;
}
function meshTrunk(curve, sd) {
  rseed(300 + sd);
  const m = new Mesh(), pts = [], lean = rr(.2, .7);
  for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push([lean * t * t + curve * sin(t * PI) * .5, t * 10, curve * .3 * sin(t * PI * 1.3)]); }
  m.tube(pts, (k) => .34 * (1.12 - .2 * k / 12) * (k === 0 ? 1.25 : 1), LV > 1 ? 6 : 9, true, (k) => .55 + .45 * k / 12);
  m.top = pts[12];
  return m;
}
function meshDates() { rseed(320); return icosphere(1, (x, y, z) => { const r = .5 + .18 * fbm(x * 3, y * 3, z * 3, 2); return [x * r, y * r * 1.5 - .3, z * r]; }); }
function meshCityBox(w, h, d, step) {
  const m = new Mesh();
  box(m, -w / 2, 0, -d / 2, w / 2, h, d / 2);
  box(m, -w / 2 - .2, h, -d / 2 - .2, w / 2 + .2, h + .9, d / 2 + .2);
  if (step) { const s = h > 20 ? h * .25 : 3.3; box(m, -w * .3, h, -d * .3, w * .25, h + s, d * .3); box(m, -w * .3 - .15, h + s, -d * .3 - .15, w * .25 + .15, h + s + .7, d * .3 + .15); }
  box(m, w * .15, h + .9, -d * .3, w * .15 + 2.4, h + 3.2, -d * .3 + 2.4);
  return m;
}
function meshBird() {
  const m = new Mesh(), X = [.17, .1, 0, -.12, -.2], H = [.01, .045, .055, .04, .012];
  const rings = [];
  for (let i = 0; i < 5; i++) { const r = []; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; r.push(m.v(sin(a) * H[i] * .9, cos(a) * H[i], X[i], 0)); } rings.push(r); }
  for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) { const k2 = (k + 1) % 6; m.quad(rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]); }
  for (const sx of [-1, 1]) {
    const a = m.v(sx * .03, .02, .06, 0), b = m.v(sx * .03, .02, -.06, 0), c = m.v(sx * .36, .03, -.02, sx), d = m.v(sx * .3, .03, -.12, sx);
    m.quad(a, c, d, b);
  }
  const t0 = m.v(0, .01, -.18, 0), t1 = m.v(.07, .01, -.3, 0), t2 = m.v(-.07, .01, -.3, 0); m.tri(t0, t1, t2);
  return m;
}
// city block sizes (w, h, d, setback storey); the last three are the taller hotels
const CITY = [[27, 6.6, 28, 0], [28, 9.9, 26, 0], [24, 9.9, 27, 1], [28, 13.2, 28, 0], [26, 6.6, 27, 1], [20, 9.9, 28, 0], [28, 19.8, 28, 1], [29, 26.4, 29, 0], [26, 33, 26, 1], [22, 6.6, 24, 1],
  [18, 16.5, 22, 1], [30, 13.2, 18, 0], [16, 23.1, 16, 0], [24, 4.4, 30, 0], [34, 9.9, 20, 1], [20, 39.6, 22, 1], [22, 49.5, 24, 1], [14, 8.8, 26, 0]];
const CITY_LOW = [0, 1, 2, 3, 4, 5, 9, 10, 11, 13, 14, 17, 3, 1];

// ---------------------------------------------------------------- materials (W_SOLID fs)
// 1 far ground · 7 stone (box facades) · 8 Green Dome · 9 silver dome · 10 gold · 11 grey-white old domes ·
// 12 palm trunk · 13 dates · 14 soil · 17 city · 18 far trunk · 19 marble floor · 20 minaret stone ·
// 21 brass screens and doors · 22 lamp glass · 23 bronze · 24 umbrella column · 25 carved facade stone · 27 granite
function makeWorld(FAR, flyPts) {
  const meshes = [], solids = [];
  const add = (m) => { meshes.push(m); return meshes.length - 1; };
  // instance record: x y z scale · quaternion · material seed shrink-distance extra
  const solid = (mesh, x, y, z, sc, q, mat, seed, far = 0, ex = 0) => (solids[mesh] ||= []).push(x, y, z, sc, q[0], q[1], q[2], q[3], mat, seed, far, ex);
  const Q0 = [0, 0, 0, 1], yawQ = (a) => qAxis(0, 1, 0, a);
  const fh = farSampler(FAR.A);
  const farB = (x, z, c) => { const gx = clamp(round((x - FO) / FC), 0, FN - 1), gz = clamp(round((z - FO) / FC), 0, FN - 1); return FAR.B[(gx + FN * gz) * 4 + c]; };
  const inBed = (x, z, m = 0) => x > BED[0] + m && x < BED[1] - m && z > BED[2] + m && z < BED[3] - m;
  const gy = (x, z) => (inBed(x, z) ? .32 : 0);
  const nCells = CELLS * CELLS;
  const cellOf = (x, z) => clamp(floor((x - OX) / CELLW), 0, CELLS - 1) + CELLS * clamp(floor((z - OZ) / CELLW), 0, CELLS - 1);
  const big = Array.from({ length: nCells }, () => []), small = Array.from({ length: nCells }, () => []);
  let nth = 0;
  // leaf record: x y z length · yaw tilt halfwidth anchor-height · type seed1 seed2 bend
  const leaf = (L, x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend) => { L[cellOf(x, z)].push(x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend); };
  const grass = (x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend) => { if (!(nth++ % THIN)) leaf(small, x, y, z, len, yaw, tilt, wid * (1 + LV / 2), hA, type, s1, s2, bend); };
  // collision: boxes [x0, x1, y0, y1, z0, z1] and vertical cylinders [x, z, r, y1]
  const CB = [], CC = [];
  const cbox = (x0, x1, y0, y1, z0, z1) => CB.push(x0, x1, y0, y1, z0, z1);

  // --- the floor: one slab over the whole composed area (the marble pattern is drawn per pixel)
  const floor_ = new Mesh();
  for (let j = 0; j < 28; j++) for (let i = 0; i < 28; i++) {
    const x0 = -FLOORH + i * 30, z0 = -FLOORH + j * 30, x1 = x0 + 30, z1 = z0 + 30;
    face(floor_, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], [0, 1, 0]);
  }
  solid(add(floor_), 0, 0, 0, 1, Q0, 19, 0);

  // --- the mosque: body, the detailed east facade, gates, roof
  const body = new Mesh(), carved = new Mesh(), screens = new Mesh(), doors = new Mesh(), bronze = new Mesh(), glass = new Mesh(), granite = new Mesh();
  box(body, MX0, 0, MZ0, FAC - .8, ROOF, MZ1);
  cbox(MX0 - .5, FAC + .6, -50, ROOF + 1.5, MZ0 - .5, MZ1 + .5);
  const E = (u, y, d) => [FAC + d, y, u];
  const skip = (u0, u1) => GATES.some(([z, w]) => u1 > z - w / 2 - 1 && u0 < z + w / 2 + 1) || MINS.some(([x, z]) => x > FAC - 2 && u1 > z - 5.5 && u0 < z + 5.5);
  for (let u = MZ0 + 6; u + 6 <= MZ1 - 6; u += 6) {
    if (skip(u, u + 6)) continue;
    const u1 = u + 6;
    archPanel(carved, E, [1, 0, 0], u, u1, 0, 10.6, u + 1, u1 - 1, .7, 6.2, .8, .7, screens);
    archPanel(carved, E, [1, 0, 0], u, u + 3, 11.6, 17.2, u + 1.05, u + 2.45, 12.5, 15, .8, .5, screens);
    archPanel(carved, E, [1, 0, 0], u + 3, u1, 11.6, 17.2, u1 - 2.45, u1 - 1.05, 12.5, 15, .8, .5, screens);
    box(carved, FAC - .8, 10.6, u, FAC + .35, 11.6, u1);
    box(carved, FAC - .8, 17.2, u, FAC + .25, 17.8, u1);
    box(carved, FAC - .8, 17.8, u, FAC + .05, ROOF, u1);
    box(granite, FAC - .8, 0, u, FAC + .22, .7, u1, .8);
    box(carved, FAC, .7, u - .42, FAC + .42, 17.2, u + .42);
  }
  // gates: a deep portal with closed doors under a pointed arch, lanterns either side, a small dome on the main one
  for (const [z, w, h, main] of GATES) {
    const d = 3.6, X = FAC + d, ow = w * .6, ys = h * .5, G = (u, y, dd) => [X + dd, y, u];
    box(carved, FAC - .8, 0, z - w / 2, X, h, z - w / 2 + .01);
    box(carved, FAC - .8, 0, z + w / 2 - .01, X, h, z + w / 2);
    archPanel(carved, G, [1, 0, 0], z - w / 2, z + w / 2, 0, h - 1.6, z - ow / 2, z + ow / 2, 0, ys, .8, d - .6, doors);
    box(carved, FAC - .8, h - 1.6, z - w / 2 - .3, X + .45, h - .7, z + w / 2 + .3);
    box(carved, FAC - .8, h - .7, z - w / 2, X + .1, h + .5, z + w / 2);
    box(granite, X - .1, 0, z - w / 2 - .2, X + .3, .8, z + w / 2 + .2, .8);
    // band framing the arch (alternating dark and light voussoirs are drawn by the carved-stone material)
    merlons(carved, X, z - w / 2, X, z + w / 2, h + .5, 1.6);
    cbox(FAC, X + .6, -50, h + 1.5, z - w / 2 - .5, z + w / 2 + .5);
    for (const s of [-1, 1]) {
      const lz = z + s * (w / 2 - (w - ow) / 4);
      box(bronze, X, 5.2, lz - .05, X + .5, 5.3, lz + .05);
      lathe(bronze, [[.05, 0], [.22, .05], [.22, .12], [.05, .2], [.02, .5]], 8, X + .55, 5.95, lz);
      lathe(glass, [[.16, 0], [.2, .25], [.2, .65], [.16, .8]], 8, X + .55, 5.15, lz);
      lathe(bronze, [[.19, 0], [.24, .1], [.05, .4]], 8, X + .55, 5.9, lz);
      LANT.push(X + .55, 5.6, lz);
    }
    if (main) { const dm = new Mesh(); lathe(dm, domeProf(3.2, 1.2, 1.1), 24, FAC + 1.4, h + .5, z); solid(add(dm), 0, 0, 0, 1, Q0, 11, 0); GATEDOME.push(FAC + 1.4, h + .5 + 5, z); }
  }
  // roof parapet all round, then the roof furniture
  merlons(carved, FAC - .25, MZ0, FAC - .25, MZ1, ROOF);
  merlons(carved, MX0 + .25, MZ0, MX0 + .25, MZ1, ROOF);
  merlons(carved, MX0, MZ0 + .25, FAC, MZ0 + .25, ROOF);
  merlons(carved, MX0, MZ1 - .25, FAC, MZ1 - .25, ROOF);
  solid(add(body), 0, 0, 0, 1, Q0, 7, .1, 0, 1);
  solid(add(carved), 0, 0, 0, 1, Q0, 25, 0, 0, 0);
  solid(add(screens), 0, 0, 0, 1, Q0, 21, 0, 0, 0);
  solid(add(doors), 0, 0, 0, 1, Q0, 21, 0, 0, 1);
  solid(add(granite), 0, 0, 0, 1, Q0, 27, 0, 0, 0);

  // sliding domes (27, silver) on square bases over the Saudi-era prayer hall
  const sdBase = new Mesh(), sdDome = new Mesh();
  let nSd = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 7 && nSd < 27; j++, nSd++) {
    const x = -300 + i * 36, z = -176 + j * 36;
    box(sdBase, x - 9.5, ROOF, z - 9.5, x + 9.5, ROOF + 1.6, z + 9.5);
    box(sdBase, x - 9.8, ROOF + 1.6, z - 9.8, x + 9.8, ROOF + 2.1, z + 9.8);
    lathe(sdDome, domeProf(8.2, .7, .78), 28, x, ROOF + 2.1, z);
  }
  rseed(21);
  for (let x = MX0 + 18; x < FAC - 10; x += 36) box(sdBase, x - .25, ROOF, MZ0 + 2, x + .25, ROOF + .6, MZ1 - 2);
  for (let z = MZ0 + 18; z < MZ1 - 10; z += 36) box(sdBase, MX0 + 2, ROOF, z - .25, FAC - 3, ROOF + .6, z + .25);
  for (let k = 0; k < 70; k++) {
    const x = rr(MX0 + 6, FAC - 8), z = rr(MZ0 + 6, MZ1 - 6), w = rr(1.5, 4), d = rr(1.5, 3), h = rr(.8, 2.2);
    if (hypot(x - GREEN[0], z - GREEN[1]) < 22 || (x > -200 && z > 90)) continue;
    box(sdBase, x - w, ROOF, z - d, x + w, ROOF + h, z + d, .8);
  }
  solid(add(sdBase), 0, 0, 0, 1, Q0, 7, .3, 0, 0);
  solid(add(sdDome), 0, 0, 0, 1, Q0, 9, 0);
  // the Ottoman-era part: a field of small grey-white domes around the Green Dome
  const smallD = new Mesh();
  for (let x = -194; x <= -104; x += 7.5) for (let z = 98; z <= 192; z += 7.5) {
    if (hypot(x - GREEN[0], z - GREEN[1]) < 17 || hypot(x - OLDMIN[0], z - OLDMIN[1]) < 7) continue;
    lathe(smallD, domeProf(2.7, .5, 1.02), 12, x, ROOF, z);
  }
  solid(add(smallD), 0, 0, 0, 1, Q0, 11, 0);
  // the Green Dome: square base, drum and ribbed dome, gold finial
  const gb = new Mesh(); box(gb, -14.5, 0, -14.5, 14.5, 2.4, 14.5); box(gb, -14.9, 2.4, -14.9, 14.9, 3, 14.9);
  solid(add(gb), GREEN[0], ROOF, GREEN[1], 1, Q0, 25, 0);
  const gd = new Mesh(); lathe(gd, [[12.2, 0], [12.2, 4.6], [11.8, 5], ...domeProf(11, 4.8, 1.18).map(([r, h]) => [r, h + 5])], 40);
  solid(add(gd), GREEN[0], ROOF + 3, GREEN[1], 1, Q0, 8, 0);
  const fin = add(meshFinial(1));
  solid(fin, GREEN[0], ROOF + 3 + 5 + 4.8 + .35 + 11 * 1.18 - .5, GREEN[1], 2.3, Q0, 10, 0);
  for (let i = 0; i < GATEDOME.length; i += 3) solid(fin, GATEDOME[i], GATEDOME[i + 1] - .2, GATEDOME[i + 2], .8, Q0, 10, 0);
  // minarets
  const mN = add(meshMinaret(MINARET_N, 9, 24, MK)), mO = add(meshMinaret(MINARET_O, 6, ROOF + 1, 1));
  for (const [x, z] of MINS) {
    solid(mN, x, 0, z, 1, yawQ(PI / 8), 20, 0, 0, 1);
    solid(fin, x, 91.3 * MK, z, 1.8, Q0, 10, 0);
    CC.push(x, z, 5.8, 1.6); cbox(x - 4.6, x + 4.6, -50, 24, z - 4.6, z + 4.6); CC.push(x, z, 4.6, 91);
  }
  solid(mO, OLDMIN[0], 0, OLDMIN[1], 1, yawQ(PI / 8), 20, .5, 0, 2);
  solid(fin, OLDMIN[0], 64.3, OLDMIN[1], 1.25, Q0, 10, 0);

  // --- the umbrellas: white columns on stone plinths; the membranes are W_UMB, opening by the shader
  const col = new Mesh();
  box(col, -.78, 0, -.78, .78, 1.05, .78, .85);
  box(col, -.84, .95, -.84, .84, 1.12, .84);
  lathe(col, [[.46, 1.12], [.42, 2.5], [.37, 12.6], [.5, 13.15], [.72, 13.45], [.72, 13.75], [.3, 13.95]], 14);
  const colId = add(col), umbs = [];
  rseed(20);
  for (let j = 0; j < UNZ; j++) for (let i = 0; i < UNX; i++) {
    const x = UX0 + i * USP, z = UZ0 + j * USP;
    // the forecourt of the main gate and its two minarets is left open
    if (i === 0 && j >= 7 && j <= 9) continue;
    solid(colId, x, 0, z, 1, Q0, 24, rnd());
    CC.push(x, z, 1.1, 14);
    umbs.push(x, z, hypot(x - UGATE[0], z - UGATE[1]) / 10 + 1.5 * fract(i * .618034 + j * .414214), rnd());
  }
  // lamp posts on two of the lanes between the columns
  const lpB = new Mesh(), lpM = new Mesh(), lpG = new Mesh();
  box(lpB, -.45, 0, -.45, .45, .75, .45, .85); box(lpB, -.5, .75, -.5, .5, .88, .5);
  lathe(lpM, [[.2, .88], [.17, 1.4], [.13, 8.3], [.2, 8.5], [.2, 8.75], [.12, 8.9], [.1, 9.6], [.18, 9.75], [0, 10.1]], 8);
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * TAU + PI / 4, ca = cos(a), sa = sin(a);
    lpM.tube([[ca * .1, 9.05, sa * .1], [ca * .5, 9.25, sa * .5], [ca * .85, 9.15, sa * .85], [ca * .95, 8.95, sa * .95]], .04, 5, false);
    lathe(lpG, [[.12, 0], [.17, .18], [.17, .5], [.12, .62]], 8, ca * .95, 8.3, sa * .95);
    lathe(lpM, [[.15, 0], [.2, .06], [.04, .28]], 8, ca * .95, 8.92, sa * .95);
    lathe(lpM, [[.04, 0], [.13, .06], [.04, .1]], 8, ca * .95, 8.24, sa * .95);
  }
  const lb = add(lpB), lm = add(lpM), lg = add(lpG);
  for (const lx of [UX0 + 1.5 * USP, UX0 + 4.5 * USP]) for (let j = 0; j < UNZ - 1; j++) {
    const lz = UZ0 + (j + .5) * USP;
    solid(lb, lx, 0, lz, 1, Q0, 27, 0); solid(lm, lx, 0, lz, 1, Q0, 23, 0); solid(lg, lx, 0, lz, 1, Q0, 22, 0);
    CC.push(lx, lz, .7, 10.1);
  }

  // --- the free-standing arcade along the east edge: two walls of pointed arches under one roof
  const arc = new Mesh(), arcB = new Mesh();
  const nBay = (ARCZ[1] - ARCZ[0]) / 5;
  for (const [x, nx] of [[ARCX[0], -1], [ARCX[1], 1]]) {
    const Pf = (u, y, d) => [x + nx * d, y, u], Pb = (u, y, d) => [x - nx * (1 - d), y, u];
    for (let b = 0; b < nBay; b++) {
      const u0 = ARCZ[0] + b * 5, u1 = u0 + 5;
      archPanel(arc, Pf, [nx, 0, 0], u0, u1, 0, 7.4, u0 + .6, u1 - .6, 0, 3.4, .8, 1, null, true);
      archPanel(arc, Pb, [-nx, 0, 0], u0, u1, 0, 7.4, u0 + .6, u1 - .6, 0, 3.4, .8, 0, null, false);
      box(arcB, x - (nx < 0 ? 0 : 1) - .1, 0, u0 - .7, x + (nx < 0 ? 1 : 0) + .1, .32, u0 + .7, .85);
      cbox(min(x, x - nx) - .1, max(x, x - nx) + .1, -50, 7.4, u0 - .75, u0 + .75);
    }
    box(arcB, x - (nx < 0 ? 0 : 1) - .1, 0, ARCZ[1] - .7, x + (nx < 0 ? 1 : 0) + .1, .32, ARCZ[1] + .7, .85);
    cbox(min(x, x - nx) - .1, max(x, x - nx) + .1, -50, 7.4, ARCZ[1] - .75, ARCZ[1] + .75);
  }
  box(arc, ARCX[0] - .3, 7.4, ARCZ[0] - .3, ARCX[1] + .3, 8.1, ARCZ[1] + .3);
  box(arc, ARCX[0] + .9, 7.25, ARCZ[0], ARCX[1] - .9, 7.4, ARCZ[1], .85);
  cbox(ARCX[0] - .3, ARCX[1] + .3, 7.25, 9.6, ARCZ[0] - .3, ARCZ[1] + .3);
  merlons(arc, ARCX[0] - .1, ARCZ[0], ARCX[0] - .1, ARCZ[1], 8.1);
  merlons(arc, ARCX[1] + .1, ARCZ[0], ARCX[1] + .1, ARCZ[1], 8.1);
  for (const z of ARCZ) { box(arc, ARCX[0] + 1, 0, z - .5, ARCX[1] - 1, 7.4, z + .5); cbox(ARCX[0], ARCX[1], -50, 7.4, z - .55, z + .55); }
  solid(add(arc), 0, 0, 0, 1, Q0, 25, .5, 0, 0);
  solid(add(arcB), 0, 0, 0, 1, Q0, 27, 0);

  // --- the palm bed behind the arcade, a low wall beyond it
  const bedM = new Mesh(), soil = new Mesh();
  box(bedM, BED[0], 0, BED[2], BED[1], .42, BED[2] + .35); box(bedM, BED[0], 0, BED[3] - .35, BED[1], .42, BED[3]);
  box(bedM, BED[0], 0, BED[2], BED[0] + .35, .42, BED[3]); box(bedM, BED[1] - .35, 0, BED[2], BED[1], .42, BED[3]);
  box(bedM, 134, 0, -360, 134.6, 1.5, 360); box(bedM, 133.9, 1.5, -360, 134.7, 1.65, 360);
  cbox(133.6, 135, -50, 1.65, -360, 360);
  face(soil, [[BED[0], .32, BED[2]], [BED[1], .32, BED[2]], [BED[1], .32, BED[3]], [BED[0], .32, BED[3]]], [0, 1, 0]);
  solid(add(bedM), 0, 0, 0, 1, Q0, 27, .2);
  solid(add(soil), 0, 0, 0, 1, Q0, 14, 0);

  // --- date palms in the bed
  const trunks = [meshTrunk(.25, 0), meshTrunk(.6, 1), meshTrunk(1.1, 2)], tIds = trunks.map(add), dId = add(meshDates());
  const palm = (x, z, H, young = 0) => {
    const y = gy(x, z) - .2, ti = (rnd() * 3) | 0, s = H / 10, yaw = rnd() * TAU, q = yawQ(yaw);
    const tp = trunks[ti].top, top = qrot3(q, [tp[0] * s, tp[1] * s, tp[2] * s]);
    const cx = x + top[0], cy = y + top[1], cz = z + top[2];
    solid(tIds[ti], x, y, z, s, q, 12, rnd(), 0, 0);
    CC.push(x, z, .5, H);
    const nF = (young ? 16 : 36) + (rnd() * (young ? 6 : 13) | 0), off = rnd() * TAU, ls = (young ? .7 : 1) * rr(.8, 1.15);
    for (let f = 0; f < nF; f++) {
      const t = f / nF, tilt = mix(.12, 1.5, pow(t, .7)) + rr(-.1, .1);
      const len = (4 + 1.4 * rnd()) * ls * mix(.78, 1.05, sqrt(t));
      leaf(big, cx, cy + .25, cz, len, off + f * 2.39996 + rr(-.12, .12), tilt, .42 * len / 4, H, 0, rnd(), rnd(), clamp(mix(.38, 1, t) + rr(-.1, .1), 0, 1));
    }
    if (!young) for (let f = 2 + (rnd() * 3 | 0); f > 0; f--) leaf(big, cx, cy - .3, cz, rr(2.6, 3.6), rnd() * TAU, rr(2.5, 2.9), .28, H, 1, rnd(), rnd(), .3);
    if (!young && H > 6.5) for (let k = 3 + (rnd() * 3 | 0); k > 0; k--) { const a = rnd() * TAU; solid(dId, cx + cos(a) * .55, cy - .75 - rnd() * .3, cz + sin(a) * .55, rr(.2, .27), yawQ(rnd() * TAU), 13, rnd(), 80, H); }
  };
  rseed(1);
  for (let z = BED[2] + 4, r = 0; z < BED[3] - 3; z += rr(6.2, 8), r++) {
    palm(BED[0] + 6 + rr(-1.2, 1.2) + (r & 1) * 2, z, rr(8.5, 13.5));
    palm(BED[1] - 7 + rr(-1.5, 1.5) - (r & 1) * 2, z + rr(2, 4), rr(9, 14.5));
  }
  // planted bed: grass and low shrubs, thicker toward the curbs
  rseed(10);
  for (let i = 0; i < 26000; i++) {
    const x = rr(BED[0] + .5, BED[1] - .5), z = rr(BED[2] + .5, BED[3] - .5);
    if (rnd() > .45 + .5 * fbm(x * .1, 4, z * .1, 2)) continue;
    const yw = rnd() * TAU;
    for (let j = 0; j < 4; j++) grass(x + rr(-.12, .12), .3, z + rr(-.12, .12), rr(.18, .42), yw + j * 1.6, rr(.1, .7), rr(.02, .04), 0, 2, rnd(), rnd(), rr(.3, .8));
  }

  // --- the city beyond: hotels east and north, low houses elsewhere (the far ground model's city mask)
  rseed(5);
  const cityIds = CITY.map((d) => add(meshCityBox(...d)));
  for (let dz = -3240; dz < 3240; dz += 360) for (let dx = -3240; dx < 3240; dx += 360) {
    const near = hypot(dx + 120, dz) < 800, ang = near ? rr(-.03, .03) : rr(-.55, .55), ca = cos(ang), sa = sin(ang);
    const sx = 5 + (rnd() * 3 | 0), sz = 5 + (rnd() * 3 | 0), lane = rnd() * 12 | 0;
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
      if (i % sx === 0 || j % sz === 0 || (i === lane && j > 6)) continue;
      const lx = i * 30 - 165 + rr(-3, 3), lz = j * 30 - 165 + rr(-3, 3), x = dx + lx * ca - lz * sa, z = dz + lx * sa + lz * ca, c = farB(x, z, 0);
      if (c < .05 || rnd() > min(1, c * 3.2) * (1 - .55 * sstep(1200, 3200, hypot(x, z))) || rnd() < .08) continue;
      if (x > -460 && x < 175 && abs(z) < 395) continue;
      const dm = hypot(x + 120, z * 1.1);
      let t = CITY_LOW[(rnd() * CITY_LOW.length) | 0];
      if (dm < 750 && (x > 175 || z < -395) && rnd() < .6) t = [6, 7, 8, 12, 15, 16, 10][(rnd() * 7) | 0];
      const sc = rr(.82, 1.04), yaw = -ang + (rnd() < .5 ? 0 : PI / 2) + rr(-.025, .025);
      solid(cityIds[t], x, fh(x, z) - .5, z, sc, yawQ(yaw), 17, rnd(), 0, CITY[t][1] * sc);
    }
  }

  // --- life: pigeons circling over the plaza, the roof and the minarets
  rseed(13);
  const birds = [];
  for (const f of [[0, 34, -40, 46, 70, 1], [-60, 48, 80, 60, 60, -1], [-150, 60, -60, 90, 70, 1], [40, 22, 120, 30, 30, -1], [-90, 85, 10, 22, 26, 1], [100, 18, -120, 26, 24, -1]]) {
    const ss_ = rnd();
    for (let i = 0; i < f[4]; i++) birds.push(f[0], f[1], f[2], f[3], ss_ + rnd() * .2, f[5] * rr(.9, 1.1) * 7 / f[3], rr(.9, 1.15), rnd());
  }
  const motes = new Float32Array(4000 * 4);
  for (let i = 0; i < motes.length; i++) motes[i] = rnd();

  // --- packing (foliage stores sorted by culling cell)
  const pack = (L) => {
    let n = 0; const start = new Uint32Array(nCells + 1);
    for (let c = 0; c < nCells; c++) { start[c] = n; n += L[c].length / 12; }
    start[nCells] = n;
    const buf = new ArrayBuffer(n * 36), f = new Float32Array(buf), u8 = new Uint8Array(buf), lo = new Float32Array(nCells).fill(1e9), hi = new Float32Array(nCells).fill(-1e9);
    let k = 0;
    for (let c = 0; c < nCells; c++) { const a = L[c]; for (let i = 0; i < a.length; i += 12, k++) {
      for (let j = 0; j < 8; j++) f[k * 9 + j] = a[i + j];
      u8[k * 36 + 32] = a[i + 8]; u8[k * 36 + 33] = a[i + 9] * 255; u8[k * 36 + 34] = a[i + 10] * 255; u8[k * 36 + 35] = a[i + 11] * 255;
      const y = a[i + 1], l = a[i + 3]; if (y - l < lo[c]) lo[c] = y - l; if (y + l > hi[c]) hi[c] = y + l;
    } }
    return { buf, n, start, lo, hi };
  };
  const fmap = new Uint8Array(FN * FN * 4);
  for (let k = 0; k < FN * FN; k++) { fmap[k * 4] = FAR.A[k * 4 + 1] * 255; fmap[k * 4 + 1] = FAR.A[k * 4 + 2] * 255; fmap[k * 4 + 2] = FAR.B[k * 4] * 255; fmap[k * 4 + 3] = FAR.B[k * 4 + 1] * 255; }
  const sol = { data: [], ranges: [] }; let si = 0;
  for (let m = 0; m < meshes.length; m++) { const a = solids[m] || []; sol.ranges.push([si, a.length / 12]); si += a.length / 12; for (let i = 0; i < a.length; i++) sol.data.push(a[i]); }
  // the scripted flight must keep clear of columns and posts (dev builds report a path that grazes one)
  for (const p of flyPts) for (let i = 0; i < CC.length; i += 4) if (p[1] < CC[i + 3] && hypot(p[0] - CC[i], p[2] - CC[i + 1]) < CC[i + 2] + .8) { console.warn(`fly path at ${p.map((v) => v.toFixed(1))} grazes an obstacle`); break; }
  return { fh, gy, meshes, solids: { data: new Float32Array(sol.data), ranges: sol.ranges }, big: pack(big), small: pack(small),
    umbs: new Float32Array(umbs), birds: new Float32Array(birds), motes, fmap, CB: new Float64Array(CB), CC: new Float64Array(CC), farIds: new Set(cityIds) };
}
const fract = (x) => x - floor(x);
const qrot3 = (q, v) => {
  const [x, y, z, w] = q, cx = y * v[2] - z * v[1] + w * v[0], cy = z * v[0] - x * v[2] + w * v[1], cz = x * v[1] - y * v[0] + w * v[2];
  return [v[0] + 2 * (y * cz - z * cy), v[1] + 2 * (z * cx - x * cz), v[2] + 2 * (x * cy - y * cx)];
};
