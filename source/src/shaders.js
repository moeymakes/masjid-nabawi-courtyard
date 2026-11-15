// ============================================================================
// WGSL sources
// ============================================================================
// Noise, detail texture, blit/bloom and the composite chain follow Abyssal Garden (MIT); the air, sky, marble,
// umbrellas, buildings and birds are this world's own. world.js loads first: its layout constants are baked in.

// smoothstep lives in its own string so modules that already have it (via S_G) can take the noise without it
const W_SS = /*wgsl*/`
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
`;
const W_NOISE = /*wgsl*/`
fn h31(p: vec3f) -> f32 { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn h33(p: vec3f) -> vec3f { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yxx) * q.zyx); }
fn vn(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3f(1., 0., 0.)), u.x), mix(h31(i + vec3f(0., 1., 0.)), h31(i + vec3f(1., 1., 0.)), u.x), u.y),
             mix(mix(h31(i + vec3f(0., 0., 1.)), h31(i + vec3f(1., 0., 1.)), u.x), mix(h31(i + vec3f(0., 1., 1.)), h31(i + vec3f(1., 1., 1.)), u.x), u.y), u.z);
}
fn fbm(p: vec3f, n: i32) -> f32 {
  var a = .5; var s = 0.; var q = p;
  for (var i = 0; i < n; i++) { s += a * vn(q); q = q * 2.03 + vec3f(17.1, 31.7, 5.3); a *= .5; }
  return s / (1. - 2. * a);
}
fn wor(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); var d = 9.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { for (var z = -1; z <= 1; z++) {
    let o = vec3f(f32(x), f32(y), f32(z)); let r = o + h33(i + o) - f; d = min(d, dot(r, r));
  } } }
  return sqrt(d);
}
`;


// ---------------------------------------------------------------- ground model (compute, load time)
// The surroundings out to 12 km, sampled every ~23 m: flat city around the mosque, Uhud to the north, the
// harrat and its cones far to the east, low ridges ringing the horizon.
// A = height, basalt, granite, wadi sand · B = city ground, palm groves
const W_GROUND = W_SS + W_NOISE + /*wgsl*/`
struct U { n: vec4u, o: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> A: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> B: array<vec4f>;
const CONES = array<vec4f, 6>(vec4f(3300., -600., 70., 260.), vec4f(4100., 900., 90., 320.), vec4f(2900., 1900., 55., 220.),
  vec4f(4700., -2200., 80., 300.), vec4f(2400., 2800., 60., 240.), vec4f(5300., 300., 95., 340.));
fn wadiX(z: f32) -> f32 { return -1900. + 60. * sin(z * .0012) + 24. * sin(z * .0031 + 1.); }
fn ridged(p: vec2f, s: f32) -> f32 { return 1. - abs(fbm(vec3f(p * s, 5.), 4) * 2. - 1.); }
fn massif(p: vec2f, c: vec2f, ang: f32, L: f32, W: f32) -> f32 {
  let r = p - c; let a = vec2f(cos(ang), sin(ang));
  let lx = dot(r, a) / L; let lz = dot(r, vec2f(-a.y, a.x)) / W;
  return pow(max(1. - lx * lx - lz * lz, 0.), 1.2);
}
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u.n.x || id.y >= u.n.y) { return; }
  let x = u.o.x + f32(id.x) * u.o.z; let z = u.o.y + f32(id.y) * u.o.z; let p2 = vec2f(x, z);
  var h = 3.5 * (fbm(vec3f(x * .0013, 1.3, z * .0013), 3) - .5) + (fbm(vec3f(x * .011, 2.1, z * .011), 2) - .5);
  let wd = abs(x - wadiX(z)) + 20. * (fbm(vec3f(x * .01, 4., z * .01), 2) - .5);
  let wadi = ss(70., 20., wd);
  h -= 3. * wadi;
  var gran = 0.;
  let lavF = ss(0., 500., x - 2600. - 400. * sin(z * .0005) - 520. * (fbm(vec3f(x * .0012, 8., z * .0012), 3) - .5));
  let lavS = ss(0., 700., x + z * .6 - 3600.);
  var lava = max(lavF, lavS);
  h += 6.5 * lava * (.8 + .4 * fbm(vec3f(x * .01, 6., z * .01), 2)) + 9. * lava * (fbm(vec3f(x * .007, 14., z * .007), 3) - .5);
  for (var k = 0; k < 6; k++) {
    let c = CONES[k]; let d = distance(p2, c.xy);
    if (d < c.w) {
      h += c.z * pow(1. - d / c.w, 1.3) - c.z * .3 * pow(max(1. - d / (c.w * .2), 0.), 2.);
      lava = max(lava, ss(c.w, c.w * .7, d));
    }
  }
  let uh = massif(p2, vec2f(300., -4500.), .12, 2800., 820.);
  h += 600. * uh * (.32 + .68 * pow(ridged(p2, .0011), 1.4)) + 140. * uh * (ridged(p2 + 300., .0036) - .55) + 60. * uh * (fbm(vec3f(x * .009, 7., z * .009), 3) - .5);
  let ay = massif(p2, vec2f(-700., 4800.), -.08, 2000., 620.);
  h += 240. * ay * (.5 + .5 * ridged(p2 + 900., .0013));
  gran = max(gran, ss(0., .08, uh + ay));
  let r = length(p2);
  let rim = ss(6500., 11000., r) * (.45 + .75 * fbm(vec3f(x * .0005, 9., z * .0005), 3));
  h += 300. * rim; gran = max(gran, ss(.1, .3, rim) * .8);
  let dm = length((p2 - vec2f(-120., 0.)) * vec2f(1., 1.1));
  h = mix(h, -.3, ss(1400., 600., dm));
  let plaza = step(-470., x) * step(x, 175.) * step(abs(z), 395.);
  var city = ss(3400., 1200., dm) * (1. - lava) * (1. - gran) * (1. - wadi * .8);
  city = max(city, ss(1000., 600., dm)) * (1. - plaza);
  var palms = ss(.5, .62, fbm(vec3f(x * .0016, 11., z * .0016), 3)) * ss(1500., 2200., dm);
  palms *= (1. - lava) * (1. - gran) * (1. - ss(.3, .5, city));
  A[id.x + u.n.x * id.y] = vec4f(h, lava, gran, wadi);
  B[id.x + u.n.x * id.y] = vec4f(city, palms, 0., 0.);
}
`;

// ---------------------------------------------------------------- fullscreen helpers
const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
`;

// surface detail texture (tileable): rg = slope, b = height, a = mottling
const W_DETAIL = W_SS + W_NOISE + W_FS + /*wgsl*/`
fn hp(p: vec2f, per: f32) -> f32 { return h31(vec3f(p - per * floor(p / per), per)); }
fn tn(p: vec2f, per: f32) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(hp(i, per), hp(i + vec2f(1., 0.), per), u.x), mix(hp(i + vec2f(0., 1.), per), hp(i + vec2f(1., 1.), per), u.x), u.y);
}
fn tf(uv: vec2f, per: f32, n: i32) -> f32 { var a = .5; var s = 0.; var pr = per; for (var i = 0; i < n; i++) { s += a * tn(uv * pr + f32(i) * 7.3, pr); pr *= 2.; a *= .5; } return s / (1. - 2. * a); }
fn tw(p: vec2f, per: f32) -> vec3f {
  let i = floor(p); let f = fract(p); var d = vec2f(9.); var id = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) {
    let o = vec2f(f32(x), f32(y)); let c = i + o; let cw = c - per * floor(c / per);
    let hh = h33(vec3f(cw, per)); let r = o + hh.xy - f; let l = dot(r, r);
    if (l < d.x) { d.y = d.x; d.x = l; id = hh.z; } else if (l < d.y) { d.y = l; }
  } }
  return vec3f(sqrt(d), id);
}
fn H(uv: vec2f) -> f32 {
  let wq = uv + .11 * (vec2f(tf(uv, 3., 4), tf(uv + .5, 3., 4)) - .5);
  let f = tf(wq, 3., 8);
  let r1 = 1. - abs(tf(wq + 1.7, 5., 6) * 2. - 1.);
  let cr = min(abs(tf(wq + 4.1, 4., 5) * 2. - 1.) * 7., 1.);
  let cr2 = min(abs(tf(wq.yx + 2.3, 9., 4) * 2. - 1.) * 9., 1.);
  let pt = tw(wq * 29., 29.);
  let pit = (1. - ss(.0, .34, pt.x)) * step(.62, pt.z);
  return f * .50 + r1 * r1 * .24 + cr * cr2 * .26 - pit * .07;
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / 1024.; let e = 1. / 1024.;
  let h = H(uv);
  let gx = H(uv + vec2f(e, 0.)) - H(uv - vec2f(e, 0.)); let gy = H(uv + vec2f(0., e)) - H(uv - vec2f(0., e));
  let s = clamp(vec2f(gx, gy) * 1024. * .5 * .075, vec2f(-1.), vec2f(1.));
  return vec4f(-s * .5 + .5, h, tf(uv + 3.7, 3., 5));
}
`;

// blit / mip / bloom chain
const W_BLIT = W_FS + /*wgsl*/`
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
fn uvOf(fc: vec4f, k: f32) -> vec2f { return fc.xy * k / vec2f(textureDimensions(t)); }
@fragment fn fsMip(@builtin(position) fc: vec4f) -> @location(0) vec4f { return textureSampleLevel(t, s, uvOf(fc, 2.), 0.); }
fn kar(c: vec3f) -> vec4f { let w = 1. / (1. + max(c.r, max(c.g, c.b))); return vec4f(c * w, w); }
@fragment fn fsDown0(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  let a = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.).rgb, vec3f(24.)));
  let b = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.).rgb, vec3f(24.)));
  let c = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.).rgb, vec3f(24.)));
  let d = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.).rgb, vec3f(24.)));
  let m = a + b + c + d;
  return vec4f(m.rgb / m.a, 1.);
}
@fragment fn fsDown(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
@fragment fn fsUp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, .5); let e = .75 / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
`;


// ---------------------------------------------------------------- shared: uniforms, sky, air, layout
const S_G = /*wgsl*/`
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f, sun: vec4f, res: vec4f, mis: vec4f };
const SUNC = vec3f(3.1, 2.15, 1.3);
const ZEN = vec3f(.11, .27, .62);
const BETA = vec3f(.6e-4, .78e-4, 1.05e-4);
const HSCALE = 300.;
const TAU = 6.2831853;
const LOW = ${LV > 1};
const FAC = ${FAC}.; const MZ0 = ${MZ0}.; const MZ1 = ${MZ1}.; const ROOF = ${ROOF}.;
const UX0 = ${UX0}.; const UZ0 = ${UZ0}.; const USP = ${USP}.; const UNX = ${UNX}.; const UNZ = ${UNZ}.;
const UGATE = vec2f(${UGATE[0]}., ${UGATE[1]}.); const UDUR = 20.; const UR = 12.75; const UH = 13.75;
const ARCX = vec2f(${ARCX[0]}., ${ARCX[1]}.); const ARCZ = vec2f(${ARCZ[0]}., ${ARCZ[1]}.);
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(.06711056, .00583715)))); }
fn hs(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn h2(p: vec2f) -> f32 { var q = fract(vec3f(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn fin(c: vec3f) -> vec4f { return vec4f(min(max(c, vec3f(0.)), vec3f(60.)), 1.); }
// box-filtered coverage of a line of half width w at distance d, for a pixel footprint fw
fn cov(d: f32, w: f32, fw: f32) -> f32 { let h = max(fw, 1e-4) * .5; return max(min(w, d + h) - max(-w, d - h), 0.) / (2. * h); }
// morning sky: deep blue overhead, gold toward the rising sun, a rose band low in the west
fn skyCol(rd: vec3f, sun: vec3f) -> vec3f {
  let y = max(rd.y, 0.);
  let h = vec2f(rd.x, rd.z); let hl = max(length(h), 1e-4);
  let tw = .5 + .5 * dot(h / hl, normalize(sun.xz));
  let mu = dot(rd, sun);
  let hor = mix(vec3f(.80, .70, .70), vec3f(1.40, .92, .54), tw * tw);
  var c = mix(hor, ZEN, pow(y, .5));
  c += vec3f(1., .5, .2) * .32 * pow(sat(1. - y * 4.), 3.) * tw * tw * tw;
  c += vec3f(.20, .07, .10) * ss(.0, .07, y) * ss(.3, .1, y) * (1. - tw) * (1. - tw);
  c += SUNC * (.05 * pow(max(mu, 0.), 5.) + .13 * pow(max(mu, 0.), 40.) + .3 * pow(max(mu, 0.), 500.));
  return mix(c, mix(vec3f(.52, .50, .52), vec3f(1., .70, .45), tw), sat(-rd.y * 5.));
}
// aerial perspective: exponential-height haze integrated in closed form along the view ray; distant things
// fade toward the sky's horizon colour in their direction (warm toward the sun, rose-grey away from it)
fn aerialAt(c: vec3f, cam: vec3f, wp: vec3f, sun: vec3f) -> vec3f {
  let v = wp - cam; let d = max(length(v), 1e-3); let rd = v / d;
  let k = rd.y / HSCALE;
  let od = select((1. - exp(-k * d)) / k, d, abs(k) < 1e-7) * exp(-max(cam.y, -30.) / HSCALE);
  let k2 = rd.y / 60.;
  let od2 = select((1. - exp(-k2 * d)) / k2, d, abs(k2) < 1e-7) * exp(-max(cam.y, -30.) / 60.);
  let T = exp(-BETA * od - vec3f(1.2e-4, 1.3e-4, 1.45e-4) * od2);
  let ins = mix(skyCol(normalize(vec3f(rd.x, max(rd.y, 0.) * .3 + .012, rd.z)), sun), vec3f(.62, .66, .78), ss(900., 6000., d) * .5);
  return c * T + ins * (1. - T);
}
fn qrot(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
// palms sway as a whole from the root: the same offset moves trunk tops and their fronds together
fn palmSway(b: vec2f, h: f32, t: f32) -> vec2f {
  let ph = dot(b, vec2f(.043, .029));
  let gust = .65 + .35 * sin(t * .23 + b.x * .004 + b.y * .003);
  return .0035 * pow(max(h, 0.), 1.5) * gust * vec2f(sin(t * .8 + ph) + .3 * sin(t * 1.9 + ph * 2.), .6 * cos(t * .63 + ph * 1.3));
}
// the umbrella nearest to a point: xy = offset from its column, zw = its grid index
fn uCell(p: vec2f) -> vec4f {
  let ij = clamp(round((p - vec2f(UX0, UZ0)) / USP), vec2f(0.), vec2f(UNX - 1., UNZ - 1.));
  return vec4f(p - vec2f(UX0, UZ0) - ij * USP, ij);
}
fn uDelay(ij: vec2f) -> f32 { if (ij.x < .5 && ij.y > 6.5 && ij.y < 9.5) { return 1e4; } return distance(vec2f(UX0, UZ0) + ij * USP, UGATE) / 10. + 1.5 * fract(ij.x * .618034 + ij.y * .414214); }
fn uOpen(clk: f32, delay: f32) -> f32 { let t = sat((clk - delay) / UDUR); return t * t * (3. - 2. * t); }
`;

const S_B = S_G + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var sC: sampler;
@group(0) @binding(3) var sS: sampler_comparison;
@group(0) @binding(4) var tSh: texture_depth_2d;
@group(0) @binding(5) var tD: texture_2d<f32>;
@group(0) @binding(8) var tF: texture_2d<f32>;
fn shUV(p: vec3f) -> vec3f { let s = g.sm * vec4f(p, 1.); return vec3f(s.x * .5 + .5, .5 - s.y * .5, s.z - .0003); }
// 1 inside the shadow map's footprint, fading to unshadowed outside it
fn shK(s: vec3f) -> f32 { let e = min(min(s.x, 1. - s.x), min(s.y, 1. - s.y)); return ss(0., .01, e) * step(s.z, 1.); }
fn shadow1(p: vec3f) -> f32 {
  let s = shUV(p);
  return mix(1., textureSampleCompareLevel(tSh, sS, s.xy, s.z), shK(s));
}
fn shadow9(p: vec3f) -> f32 {
  if (LOW) { return shadow1(p); }
  let s = shUV(p); let e = 1.3 / ${SHADOW}.; var a = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { a += textureSampleCompareLevel(tSh, sS, s.xy + vec2f(f32(x), f32(y)) * e, s.z); } }
  return mix(1., a / 9., shK(s));
}
// how much open sky a point sees: less under an open canopy, at the foot of a column, by the facade, in the arcade
fn skyOcc(p: vec3f) -> f32 {
  let u = uCell(p.xz);
  let inside = (1. - ss(10.5, 13.5, max(abs(u.x), abs(u.y)))) * ss(16., 13.5, p.y);
  var o = 1. - .6 * uOpen(g.mis.w, uDelay(u.zw)) * inside;
  o *= mix(.6, 1., ss(.9, 2.8, length(u.xy) + p.y * .4));
  let fz = step(MZ0, p.z) * step(p.z, MZ1);
  o *= mix(1., mix(.55, 1., ss(0., 6., p.x - FAC)), fz * ss(ROOF + 2., ROOF - 4., p.y));
  let ax = ss(ARCX.x - .5, ARCX.x + 1.5, p.x) * ss(ARCX.y + .5, ARCX.y - 1.5, p.x) * step(ARCZ.x, p.z) * step(p.z, ARCZ.y) * step(p.y, 7.3);
  return o * (1. - .65 * ax);
}
fn amb(n: vec3f, sky: f32) -> vec3f {
  let up = n.y * .5 + .5;
  return (mix(ZEN, vec3f(.40, .38, .42), .35) * 1.15 * up * up * (.3 + .7 * sky) + vec3f(.78, .64, .50) * .5 * (1. - up) * (.55 + .45 * sky) + vec3f(.12, .11, .10) * (.5 + .5 * sky));
}
fn aerial(c: vec3f, wp: vec3f) -> vec3f { return aerialAt(c, g.cam.xyz, wp, g.sun.xyz); }
`;

// ---------------------------------------------------------------- solids: floor, buildings, columns, lamps, palms
// instance c: x material, y seed, z distance at which the mesh has shrunk away (0 = never), w variant
const W_SOLID = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) on: vec3f,
  @location(4) @interpolate(flat) m: vec4f, @location(5) @interpolate(flat) q: vec4f, @location(6) ao: f32 };
const GATEZ = array<vec3f, 3>(${GATES.map(([z, w, h]) => `vec3f(${z}., ${w}., ${h})`).join(', ')});
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  var sc = i.a.w;
  if (i.c.z > .5 && g.res.x > 0.) { sc *= 1. - ss(i.c.z * .7, i.c.z, distance(i.a.xyz, g.cam.xyz) / g.mis.z); }
  let lp = i.p * sc;
  var w = i.a.xyz + qrot(i.b, lp);
  let mt = i.c.x;
  if (abs(mt - 12.) < .5) { let sw = palmSway(i.a.xz, lp.y, g.cam.w); w.x += sw.x; w.z += sw.y; }
  if (abs(mt - 13.) < .5) { let sw = palmSway(i.a.xz, i.c.w, g.cam.w); w.x += sw.x; w.z += sw.y; }
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = qrot(i.b, i.n.xyz);
  let arch = (mt > 4.5 && mt < 11.5) || mt > 16.5;
  o.op = select(select(lp + i.c.y * 37., lp, arch), w, mt < 1.5); o.on = i.n.xyz;
  o.m = i.c; o.q = i.b; o.ao = i.n.w;
  return o;
}
struct TP { h: f32, c: f32, n: vec3f };
fn tri(p: vec3f, n: vec3f, s: f32) -> TP {
  var w = pow(abs(n), vec3f(4.)); w /= (w.x + w.y + w.z);
  let x = textureSample(tD, sR, p.zy * s); let y = textureSample(tD, sR, p.xz * s); let z = textureSample(tD, sR, p.xy * s);
  var o: TP;
  o.h = x.b * w.x + y.b * w.y + z.b * w.z;
  o.c = x.a * w.x + y.a * w.y + z.a * w.z;
  let a = x.rg * 2. - 1.; let b = y.rg * 2. - 1.; let c = z.rg * 2. - 1.;
  o.n = vec3f(0., a.y, a.x) * w.x + vec3f(b.x, 0., b.y) * w.y + vec3f(c.x, c.y, 0.) * w.z;
  return o;
}
// pointed-arch arcade painted on the plain facades: bay width bw, opening height ah; 1 inside an opening
fn arcade(u: f32, v: f32, bw: f32, ah: f32, v0: f32) -> f32 {
  let x = (fract(u / bw) - .5) * bw; let hw = bw * .36;
  let y = v - v0;
  let top = ah + hw * 1.15 * sqrt(max(1. - (x / hw) * (x / hw), 0.)) - abs(x) * .35;
  return step(abs(x), hw) * step(0., y) * step(y, top);
}
// signed distance outside a two-centred arch of half width hw springing at ys with arc radius R (local u, v)
fn archD(bu: f32, v: f32, hw: f32, ys: f32, R: f32) -> vec2f {
  let dv = v - ys;
  if (dv <= 0.) { return vec2f(abs(bu) - hw, floor(dv / .55) + 50.); }
  let cu = sign(bu) * (hw - R);
  let r = vec2f(bu - cu, dv);
  return vec2f(length(r) - R, floor(atan2(dv, abs(bu - cu)) / .13));
}
// marble floor: white slabs with grey border bands, sand-coloured pinstripes, an eight-pointed star around each
// column and diagonals out to the cell corners. rgb = albedo, a = polish
fn marble(p: vec2f, fw: f32, vein: f32) -> vec4f {
  let inPlaza = step(-460., p.x) * step(p.x, 141.) * step(abs(p.y), 398.);
  let c = p - vec2f(UX0, UZ0); let q = c - USP * round(c / USP); let aq = abs(q);
  let db = USP * .5 - max(aq.x, aq.y);
  let star = min(max(aq.x, aq.y) - 4.4, (aq.x + aq.y) * .70711 - 4.4);
  let dg = min(abs(q.x - q.y), abs(q.x + q.y)) * .70711;
  let border = cov(db, .5, fw);
  let pin = max(cov(abs(db - .85), .07, fw), cov(abs(star), .11, fw));
  let inner = cov(abs(star + .55), .05, fw);
  let diag = cov(dg, .07, fw) * ss(.0, .3, star - .2) * ss(1.2, 1.5, db);
  let uc = uCell(p);
  let ring = sat((1.7 - length(uc.xy)) / max(fw, 1e-3) + .5) * step(uDelay(uc.zw), 1e3);
  let sl = p / 1.2; let jd = abs(fract(sl) - .5) * 1.2;
  let joint = max(cov(.6 - jd.x, .0025, fw), cov(.6 - jd.y, .0025, fw));
  let id = floor(sl); let hh = h2(id);
  var col = vec3f(.80, .79, .755) * (.975 + .05 * hh);
  col = mix(col, vec3f(.66, .66, .66), vein * .35 * (1. - border));
  col = mix(col, vec3f(.84, .82, .77), sat(-star / .4) * .5);
  col = mix(col, vec3f(.62, .50, .37), max(pin, inner));
  col = mix(col, vec3f(.34, .34, .355), max(border, diag));
  col = mix(col, vec3f(.20, .20, .21), ring);
  col *= 1. - .35 * joint;
  let pave = vec3f(.47, .44, .40) * (.9 + .1 * h2(floor(p / 2.4)));
  return mix(vec4f(pave * (1. - .3 * max(cov(1.2 - abs(fract(p.x / 2.4) - .5) * 2.4, .01, fw), cov(1.2 - abs(fract(p.y / 2.4) - .5) * 2.4, .01, fw))), .1), vec4f(col, mix(.9, .75, max(border, ring))), inPlaza);
}
// what the polished floor mirrors: the lit east facade, the undersides of the open canopies, otherwise the sky
fn floorRefl(p: vec3f, R: vec3f) -> vec3f {
  var col = skyCol(R, g.sun.xyz); var tm = 1e9;
  if (R.x < -1e-3) {
    let t = (FAC + .3 - p.x) / R.x; let q = p + R * t;
    if (q.y < ROOF + 1.2 && q.z > MZ0 && q.z < MZ1) {
      tm = t;
      let bu = fract((q.z - MZ0) / 6.) * 6. - 3.;
      let dark = step(abs(bu), 2.) * step(.7, q.y) * step(q.y, 6.2 + 3. * sqrt(sat(1. - bu * bu * .25)));
      col = vec3f(.80, .74, .64) * (SUNC * .82 * shadow1(q + vec3f(1., 0., 0.)) + vec3f(.35, .36, .42)) * (1. - .85 * dark);
      col = aerialAt(col, q, p, g.sun.xyz);
    }
  }
  if (R.y > 1e-3) {
    let t = (15.6 - p.y) / R.y;
    if (t < tm) {
      let q = p + R * t; let u = uCell(q.xz);
      let k = uOpen(g.mis.w, uDelay(u.zw)) * (1. - ss(11.6, 12.9, max(abs(u.x), abs(u.y))));
      col = mix(col, vec3f(.95, .84, .70) * .85, k);
    }
  }
  return col;
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let mat = i32(i.m.x + .5); let sd = i.m.y; let fl_ = select(-1., 1., ff);
  let on = normalize(i.on) * fl_; let n0 = normalize(i.n) * fl_;
  let dist = length(i.wp - g.cam.xyz);
  let far = mat == 1;
  let ts = select(select(1., .035, far), .5, mat >= 5 && mat != 12);
  let A = tri(i.op, on, .07 * ts); let B = tri(i.op, on, .31 * ts); let C = tri(i.op, on, 1.3 * ts);
  let Lg = textureSample(tD, sR, i.wp.xz * .0045 + .31);
  let fm = textureSample(tF, sC, i.wp.xz / 24000. + .5);
  let fwp = length(fwidth(i.wp.xz)); let fw3 = length(fwidth(i.wp));
  let vt = textureSample(tD, sR, i.wp.xz * .11 + vec2f(.37, .71));
  var bump = 1.; var gloss = .08; var alb = vec3f(.5); var emi = vec3f(0.); var metal = 0.; var vao = 1.; var polish = 0.;
  let flt = ss(.7, .92, n0.y);
  // facade coordinates for building materials: along the wall and up it
  let fu = select(i.op.z, i.op.x, abs(on.z) > abs(on.x)); let fv = i.op.y; let wall = 1. - ss(.45, .7, abs(on.y));
  let wfade = 1. - ss(.25, .6, fwidth(fu / 3.4) + fwidth(fv / 3.3));
  if (mat <= 1) {
    let lava = fm.r; let gran = fm.g; let city = fm.b;
    alb = mix(vec3f(.52, .36, .22), vec3f(.64, .47, .30), sat(A.c * .9 + Lg.a * .9 - .55)) * (.7 + .45 * mix(B.h, Lg.b, .45)) * (.84 + .32 * C.c);
    var gra = mix(vec3f(.46, .21, .12), vec3f(.62, .33, .19), A.c) * (.68 + .55 * B.h);
    gra = mix(gra, gra * vec3f(.55, .5, .5), ss(.55, .8, B.c) * .5);
    alb = mix(alb, gra, sat(gran * 1.4) * (1. - .1 * flt));
    alb = mix(alb, mix(vec3f(.44, .41, .37) * (.92 + .12 * C.c), vec3f(.62, .60, .56), ss(.9, .97, city)), ss(.05, .2, city));
    alb = mix(alb, mix(vec3f(.09, .075, .065), vec3f(.18, .135, .10), A.h) * (.7 + .6 * B.c), lava * .8);
    bump = mix(.8, .2, ss(.05, .2, city)); gloss = .03;
  } else if (mat == 7 || mat == 17) {
    // plain stone facades (7) with arcades painted on, and city buildings (17) with windows by floor
    let hh = hs(sd * 3.7);
    let ct = select(select(select(select(vec3f(.74, .66, .54), vec3f(.66, .57, .46), hh > .3), vec3f(.76, .74, .70), hh > .55), vec3f(.66, .54, .42), hh > .75), vec3f(.58, .56, .53), hh > .9);
    alb = select(vec3f(.80, .75, .66), ct, mat == 17) * (.86 + .2 * B.h) * (.94 + .1 * C.c);
    if (mat == 17) {
      let bw = mix(2.6, 4.6, hs(sd * 11.)); let ww = mix(.18, .34, hs(sd * 13.));
      let wx = fract(fu / bw); let wy = fract(fv / 3.3); let flr = floor(fv / 3.3); let bay = floor(fu / bw);
      let win = step(.5 - ww, wx) * step(wx, .5 + ww) * step(.3, wy) * step(wy, .74) * step(1., flr) * wall * step(fv, i.m.w - 1.) * wfade * step(.15, hs(bay * 3.1 + flr * 5.7 + sd));
      let lit = step(.9, hs(flr * 13.1 + bay * 7.7 + sd * 31.));
      alb = mix(alb, vec3f(.07, .08, .09), win * .9);
      alb = mix(alb, alb * vec3f(.82, .8, .78), (1. - wfade) * wall * .5);
      emi = vec3f(1., .62, .30) * .5 * win * lit;
      alb = mix(alb, alb * vec3f(.5, .47, .45), ss(.6, .9, on.y));
      gloss = mix(.08, .55, win);
    } else {
      let a1 = arcade(fu, fv, 6., 6.5, .7) * wall * step(.5, i.m.w);
      let a2 = arcade(fu + 3., fv, 3., 2., 12.5) * wall * step(fv, 17.) * step(.5, i.m.w);
      alb = mix(alb, vec3f(.05, .045, .04), max(a1, a2) * .92);
      let band = ss(.9, .96, fract(fv / 8.7)) * wall;
      alb = mix(alb, alb * vec3f(.9, .84, .74), band * .6);
      let seam = 1. - ss(.0, .04, abs(fract(i.op.x / 12.) - .5) * 2. - .9) * ss(.0, .04, abs(fract(i.op.z / 12.) - .5) * 2. - .9);
      alb = mix(alb, vec3f(.82, .79, .73) * (1. - .15 * seam) * (.9 + .2 * B.c), ss(.6, .9, on.y));
    }
    bump = .05;
  } else if (mat == 25 || mat == 20) {
    // carved pale stone: ashlar courses, and black-and-white voussoirs round every arch
    alb = select(vec3f(.83, .77, .67), vec3f(.86, .81, .72), mat == 20) * (.9 + .12 * B.h) * (.95 + .08 * C.c);
    let cj = max(cov(abs(fract(fv / .62) - .5) * .62 - .3, .006, fw3), cov(abs(fract(fu / 1.24 + floor(fv / .62) * .5) - .5) * 1.24 - .61, .006, fw3)) * wall;
    alb *= 1. - .22 * cj;
    if (mat == 25 && abs(on.x) > .7) {
      var hw = 2.; var ys = 6.2; var R = 3.2; var bu = fract((i.wp.z - MZ0) / 6.) * 6. - 3.; var on_ = step(fv, 10.6);
      if (fv > 11.6) { bu = fract((i.wp.z - MZ0) / 3.) * 3. - 1.5 + select(-.25, .25, fract((i.wp.z - MZ0) / 6.) > .5); hw = .7; ys = 15.; R = 1.12; on_ = step(fv, 17.2); }
      if (i.wp.x > 80.) { bu = fract((i.wp.z - ARCZ.x) / 5.) * 5. - 2.5; hw = 1.9; ys = 3.4; R = 3.04; on_ = step(fv, 7.4); }
      if (abs(i.wp.x - FAC - 3.6) < .4) {
        for (var k = 0; k < 3; k++) { let gz = GATEZ[k]; if (abs(i.wp.z - gz.x) < gz.y * .5) { bu = i.wp.z - gz.x; hw = gz.y * .3; ys = gz.z * .5; R = gz.y * .48; on_ = step(fv, gz.z - 1.6); } }
      }
      let ad = archD(bu, fv, hw, ys, R);
      let bwid = .16 * R + .2;
      let vb = cov(ad.x - bwid * .5, bwid * .5, fw3) * on_;
      let odd = fract(ad.y * .5) > .25;
      alb = mix(alb, select(vec3f(.86, .83, .76), vec3f(.13, .12, .12), odd), vb);
      alb = mix(alb, alb * .82, cov(ad.x - bwid - .05, .05, fw3) * on_);
    }
    if (mat == 20) {
      // minaret: blind pointed niches on the octagon faces of each stage, dark openings in the lantern, warm lamps under the balconies
      let ang = atan2(i.op.z, i.op.x); let fa = (fract(ang / TAU * 8. + .5) - .5) * TAU / 8.;
      let rr = length(i.op.xz); let fuo = rr * sin(fa);
      let k = select(${MK}, 1., i.m.w > 1.5);
      let y = i.op.y / k;
      var st = vec3f(0.);
      if (i.m.w < 1.5) {
        if (y > 23.5 && y < 47.) { st = vec3f(24.5, 46., .8); }
        if (y > 53. && y < 66.) { st = vec3f(54., 65.2, .7); }
        if (y > 71. && y < 78.3) { st = vec3f(71.6, 77.6, .55); }
        if (y > 82.4 && y < 85.8) { st = vec3f(82.6, 85.4, .5); }
      } else {
        if (y > 20. && y < 39.) { st = vec3f(21., 38., .55); }
        if (y > 43.2 && y < 51.4) { st = vec3f(43.8, 51., .45); }
        if (y > 54.5 && y < 57.8) { st = vec3f(54.8, 57.5, .4); }
      }
      if (st.z > 0. && rr < 4.2 * k && abs(on.y) < .5) {
        let ad = archD(fuo, y, st.z, st.y - st.z * 1.6, st.z * 1.5);
        let inN = step(st.x, y) * sat(-ad.x / max(fw3, 1e-3) + .5);
        let lantern = step(82., y) * step(y, 86.) * f32(i.m.w < 1.5) + step(54.4, y) * step(y, 57.8) * f32(i.m.w > 1.5);
        alb = mix(alb, mix(alb * .72, vec3f(.04, .035, .03), lantern), inN);
        emi += vec3f(1., .66, .32) * 2.5 * inN * lantern;
        alb = mix(alb, alb * vec3f(.9, .82, .7), cov(max(ad.x, 0.) - .1, .07, fw3) * step(st.x, y));
      }
      let bal = select(vec3f(48.4, 66.6, 78.8), vec3f(39.6, 51.6, 54.3), i.m.w > 1.5);
      for (var b = 0; b < 3; b++) { emi += vec3f(1., .62, .3) * .7 * ss(bal[b] - .4, bal[b] + .6, y) * ss(bal[b] + 2.1, bal[b] + 1.3, y) * step(on.y, -.1); }
      alb = mix(alb, alb * vec3f(.88, .82, .72), cov(abs(fract(y / 3.05) - .5) * 3.05 - 1.48, .05, fw3) * step(24., y));
    }
    bump = .05; gloss = .12;
  } else if (mat == 8) {
    let rib = ss(.4, .5, abs(fract(atan2(i.op.z, i.op.x) / TAU * 32.) - .5)) * .3;
    alb = vec3f(.06, .29, .16) * (1. - rib) * (.92 + .16 * B.h); gloss = .5; bump = .05;
    let drum = step(i.op.y, 4.3);
    let wa = fract(atan2(i.op.z, i.op.x) / TAU * 16.) - .5;
    let wn = step(abs(wa), .14) * step(1., i.op.y) * step(i.op.y, 3.3 + .5 * sqrt(sat(1. - wa * wa * 51.))) * drum;
    alb = mix(alb, vec3f(.03, .04, .035), wn);
    alb = mix(alb, vec3f(.78, .64, .32), cov(abs(i.op.y - 4.4), .12, fw3) * .8); metal = mix(0., .8, cov(abs(i.op.y - 4.4), .12, fw3));
  } else if (mat == 9) {
    let pan = cov(abs(fract(atan2(i.op.z, i.op.x) / TAU * 48.) - .5) * TAU / 48. * length(i.op.xz), .04, fw3);
    alb = vec3f(.60, .62, .64) * (.92 + .12 * B.h) * (1. - .25 * pan); gloss = .7; metal = .7; bump = .1;
  } else if (mat == 10) {
    alb = vec3f(1., .72, .30); gloss = .9; metal = 1.; bump = 0.;
  } else if (mat == 11) {
    alb = vec3f(.74, .74, .72) * (.92 + .1 * B.h); gloss = .2; bump = .1;
  } else if (mat == 12) {
    // date palm trunk: spiral of cut leaf bases makes a diamond crosshatch
    let ang = atan2(i.op.z - sd * 37., i.op.x - sd * 37.) / TAU;
    let k1 = abs(fract(i.op.y * 3.3 + ang * 8.) - .5); let k2 = abs(fract(i.op.y * 3.3 - ang * 8.) - .5);
    let grv = 1. - ss(.03, .2, min(k1, k2));
    alb = mix(vec3f(.34, .25, .16), vec3f(.24, .17, .11), B.c) * (1. - .3 * grv) * (.88 + .24 * C.h);
    vao = mix(.55, 1., ss(0., 2., i.op.y - sd * 37.)); bump = .8;
  } else if (mat == 13) {
    alb = mix(vec3f(.38, .15, .04), vec3f(.24, .08, .03), hs(sd * 17.)) * (.8 + .3 * C.h); gloss = .35; bump = .6;
  } else if (mat == 14) {
    alb = vec3f(.16, .12, .08) * (.8 + .35 * B.h); bump = .5; gloss = .02;
  } else if (mat == 19) {
    let m = marble(i.wp.xz, fwp, 1. - ss(.0, .035 + fwp * .5, abs(vt.b - .52)));
    alb = m.rgb; polish = m.a * .55; bump = 0.; gloss = .6;
  } else if (mat == 21) {
    // closed brass lattice screens (w 0) and brass doors with raised panels and studs (w 1), dark behind
    let u = i.wp.z; let v = i.wp.y;
    if (i.m.w < .5) {
      let c = vec2f(u, v) / .42; let q = abs(fract(c) - .5) * .42; let qd = abs(fract(c + .5) - .5) * .42;
      let bars = max(max(cov(q.x, .02, fw3), cov(q.y, .02, fw3)), cov(abs(qd.x + qd.y - .21) * .7071, .016, fw3));
      alb = mix(vec3f(.018, .015, .012), vec3f(.52, .38, .17), bars); metal = .8 * bars; gloss = .5 * bars;
    } else {
      let c = vec2f(u / .8, (v - .4) / 1.05); let q = abs(fract(c) - .5) * vec2f(.8, 1.05);
      let fr = max(cov(q.x - .37, .04, fw3), cov(q.y - .49, .04, fw3));
      let st = cov(length(abs(fract(vec2f(u, v) / .2) - .5) * .2), .025, fw3) * (1. - fr);
      alb = vec3f(.60, .44, .20) * (1. - .45 * fr) * (1. + .3 * st); metal = .85; gloss = .6;
    }
    bump = .02;
  } else if (mat == 22) {
    alb = vec3f(.9, .85, .7); emi = vec3f(2.6, 1.75, .95) * 2.2; gloss = .8;
  } else if (mat == 23) {
    alb = vec3f(.30, .22, .12) * (.9 + .2 * B.h); metal = .7; gloss = .55; bump = .1;
  } else if (mat == 24) {
    alb = vec3f(.86, .86, .84) * (.96 + .05 * B.h); gloss = .35; bump = .02;
  } else if (mat == 27) {
    alb = mix(vec3f(.30, .30, .31), vec3f(.46, .45, .44), ss(.4, .7, C.c)) * (.85 + .3 * hs(floor(C.h * 9.))); gloss = .55; bump = .15;
  }
  let N = normalize(qrot(i.q, normalize(on + (A.n * .8 + B.n * .6 + C.n * .4 * ss(70., 10., dist)) * bump)));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let so = select(skyOcc(i.wp + n0 * .3), 1., far || mat == 17);
  var ao = so * vao * select(1., i.ao, far || mat >= 20 || mat == 12);
  let sh = select(shadow9(i.wp + n0 * (.12 + dist * .0015) + g.sun.xyz * .12), sat(i.ao * 1.6 - .3), far);
  let E = SUNC * sh;
  let ndl = sat(dot(N, L));
  let am = amb(N, so) * ao;
  var c = alb * (E * ndl + am) + emi;
  let Hh = normalize(V + L);
  let spc = mix(vec3f(.04), alb, metal);
  c += E * spc * pow(sat(dot(N, Hh)), mix(8., 160., gloss)) * gloss * ndl * 4.;
  if (mat == 19) {
    // polished marble: a Fresnel mirror of the facade, the canopies and the sky, plus the sun's glint
    let Rr = reflect(-V, N); let fr = .04 + .96 * pow(1. - sat(dot(N, V)), 5.);
    c = c * (1. - fr * polish) + mix(floorRefl(i.wp, Rr), vec3f(.75, .72, .72), .25) * fr * polish * mix(.5, 1., so);
    c += E * pow(sat(dot(Rr, L)), 900.) * 30. * fr * polish;
  } else {
    c += skyCol(reflect(-V, N), L) * ao * spc * gloss * pow(1. - sat(dot(N, V)), 3.) * 1.5;
  }
  return fin(aerial(c, i.wp));
}
`;

// ---------------------------------------------------------------- umbrella membranes, opening in the vertex shader
// Each instance (x, z, delay, seed) draws a 64 x 14 grid of the membrane around its column head. Closed, the arms
// stand up in a slim pleated bud about 21 m tall; opening, they swing out and down while the fabric stretches into
// a square tulip 25.5 m across, corners highest. The shadow pass uses the same vertex shader.
const W_UMB = S_B + /*wgsl*/`
struct UO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) @interpolate(flat) k: vec2f };
const NA = 64.; const NR = 14.;
fn mem(a: f32, s: f32, e: f32) -> vec3f {
  let L = UR / max(abs(cos(a)), abs(sin(a))); let cn = sat((L - UR) / (UR * .4142));
  let sg = sin(4. * a);
  let ro = s * L; let vo = .3 + 2.1 * pow(s, 1.6) + 1.7 * s * s * cn - .35 * s * sg * sg;
  let rc = (.3 + .8 * pow(max(sin(3.1416 * min(s * 1.06, 1.)), 0.), .7)) * (.6 + .4 * cos(8. * a));
  let vc = .45 + s * 7.3;
  let po = atan2(ro, vo); let pc = atan2(rc, vc);
  let l = mix(length(vec2f(rc, vc)), length(vec2f(ro, vo)), e); let p = mix(pc, po, e);
  return vec3f(cos(a) * sin(p) * l, cos(p) * l, sin(a) * sin(p) * l);
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) ins: vec4f) -> UO {
  var o: UO;
  let q = vi / 6u; let c = vi % 6u;
  let du = select(0., 1., c == 1u || c == 2u || c == 4u);
  let dv = select(0., 1., c == 2u || c == 4u || c == 5u);
  let a = (f32(q % 64u) + du) / NA * TAU; let s = pow((f32(q / 64u) + dv) / NR, .85);
  let t = sat((g.mis.w - ins.z) / UDUR); let e = t * t * (3. - 2. * t);
  let s1 = max(s, .02);
  let P = mem(a, s, e); let P1 = mem(a, s1, e);
  let n = normalize(cross(mem(a + .01, s1, e) - P1, mem(a, s1 + .01, e) - P1));
  let w = vec3f(ins.x, UH, ins.y) + P;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = n; o.uv = vec2f(a, s); o.k = vec2f(e, ins.w);
  return o;
}
@fragment fn fs(i: UO) -> @location(0) vec4f {
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let ng = normalize(i.n); let top = dot(ng, V) > 0.; let n = select(-ng, ng, top);
  let a = i.uv.x; let s = i.uv.y; let e = i.k.x;
  let Le = UR / max(abs(cos(a)), abs(sin(a))) * s * mix(.15, 1., e);
  let seamD = abs(fract(a / TAU * 32. + .5) - .5) * TAU / 32. * Le;
  let armD = abs(fract(a / TAU * 8. + .5) - .5) * TAU / 8. * Le;
  let fw = fwidth(seamD) + fwidth(s) * 4.;
  let seam = cov(seamD, .02, fw) * ss(.1, .3, s);
  let arm = cov(armD, .1, fw) * ss(.06, .2, s) * f32(!top) * ss(.2, .6, e);
  let hem = cov(1. - s, .012, fwidth(s) * 1.5);
  let sunSide = select(-1., 1., dot(ng, L) > 0.);
  let Es = SUNC * shadow9(i.wp + ng * sunSide * .4);
  let ndl = abs(dot(ng, L));
  let lit = select(.3, 1., select(-1., 1., top) == sunSide);
  let so = skyOcc(i.wp + n * 1.5);
  var alb = vec3f(.90, .89, .86) * (1. - .2 * seam) * (.97 + .06 * h2(vec2f(floor(a / TAU * 32.), i.k.y * 91.)));
  let bounce = vec3f(.95, .80, .62) * .5 * sat(-n.y) * mix(.6, 1., e);
  var c = alb * (Es * ndl * lit + amb(n, so) + bounce);
  c += Es * pow(sat(dot(n, normalize(V + L))), 40.) * .08 * f32(top);
  c = mix(c, vec3f(.55, .55, .56) * (amb(n, so) + bounce * .6), arm);
  c = mix(c, c * .6, hem);
  return fin(aerial(c, i.wp));
}
`;

// ---------------------------------------------------------------- fronds, grass, shrubs
// instance: a = anchor xyz + length, b = yaw, tilt from vertical, half width, height of the anchor above ground,
// c (unorm8) = type, seed1, seed2, bend
const W_LEAF = S_B + /*wgsl*/`
override ROWS: f32 = 7.;
override FAR: f32 = 400.;
struct LI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f };
struct LO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) @interpolate(flat) col: vec3f, @location(4) @interpolate(flat) pr: vec4f, @location(5) @interpolate(flat) sd: vec2f };
fn grassSway(p: vec2f, h: f32, t: f32) -> vec2f {
  let ph = dot(p, vec2f(.071, .043));
  return .05 * h * (vec2f(sin(t * 1.3 + ph), cos(t * 1.1 + ph * 1.3)) + .4 * vec2f(sin(t * 3.1 + ph * 3.), cos(t * 2.7 + ph * 2.)));
}
@vertex fn vs(@builtin(vertex_index) vi: u32, i: LI) -> LO {
  var o: LO;
  let u = f32(vi & 1u) * 2. - 1.; let v = f32(vi >> 1u) / (ROWS - 1.);
  let ty = i32(i.c.x * 255. + .5); let s1 = i.c.y; let s2 = i.c.z;
  let t = g.cam.w; let len = i.a.w; let hA = i.b.w;
  let cy = cos(i.b.x); let sy = sin(i.b.x); let ct = cos(i.b.y); let st = sin(i.b.y);
  let d = vec3f(st * cy, ct, st * sy); let pe = vec3f(ct * cy, -st, ct * sy); let sd = vec3f(-sy, 0., cy);
  var col = vec3f(0.); var pr = vec4f(0.); var shp = 0.; var fold = 0.;
  let palm = ty == 0 || ty == 1 || ty == 5;
  switch ty {
    case 0 { col = mix(vec3f(.09, .14, .035), vec3f(.18, .20, .055), s1); pr = vec4f(1., .55, 0., 0.); fold = .5; }
    case 1 { col = mix(vec3f(.20, .14, .075), vec3f(.28, .20, .10), s1); pr = vec4f(1., .3, 0., 0.); fold = .3; }
    case 2 { col = mix(vec3f(.12, .22, .05), vec3f(.24, .32, .08), s1); pr = vec4f(0., .8, 0., 0.); }
    case 3 { col = mix(vec3f(.20, .21, .14), vec3f(.28, .23, .13), s1); pr = vec4f(0., .4, 0., 0.); }
    case 4 { col = mix(vec3f(.12, .16, .06), vec3f(.18, .20, .08), s1); pr = vec4f(0., .6, 0., 0.); }
    default { col = mix(vec3f(.09, .12, .04), vec3f(.15, .16, .05), s1); pr = vec4f(0., .6, 0., 0.); }
  }
  // fronds droop along a circular arc and flutter; grass and shrubs bend and sway from the root
  let fl = sin(t * (1.7 + s1) + s2 * 40. + hA * .3) * select(.12, .2, palm);
  let k0 = (i.c.w - .2) * select(1.5, 2.6, palm) + fl * v;
  let ka = select(k0, .05, abs(k0) < .05);
  let sK = sin(ka * v); let cK = cos(ka * v);
  let c = i.a.xyz + len * (d * (sK / ka) + pe * ((1. - cK) / ka));
  let N = normalize(pe * cK - d * sK);
  var w = i.b.z;
  if (palm) { w *= ss(.0, .16, v) * (1. - .8 * pow(v, 1.8)) * select(1., .55, ty == 5); }
  else { w *= pow(max(sin(3.14159 * pow(v, .6)), 0.), .7); }
  let cd = distance(i.a.xyz, g.cam.xyz);
  let farK = select((1. - ss(FAR * g.mis.z * .8, FAR * g.mis.z, cd)), 1., g.res.x == 0.);
  var p = c + sd * u * w * farK - N * abs(u) * w * fold;
  if (palm) { let sw = palmSway(i.a.xz - vec2f(0., 0.), hA, t); p.x += sw.x; p.z += sw.y; }
  else { let sw = grassSway(i.a.xz, p.y - i.a.y + hA, t); p.x += sw.x; p.z += sw.y; }
  o.cp = g.vp * vec4f(p, 1.); o.wp = p; o.n = normalize(-N - sd * u * fold * .9); o.uv = vec2f(u, v);
  o.col = col; o.pr = pr; o.sd = vec2f(s1, s2);
  return o;
}
fn leafCov(i: LO) -> f32 {
  let s = i.uv.y * 38. + abs(i.uv.x) * 4.2 + i.sd.x * 7.;
  let fw = fwidth(s);
  let f = abs(fract(s) - .5) * 2.;
  let lw = .56 * (1. - .45 * abs(i.uv.x));
  var cov = 1. - ss(lw - fw, lw + fw, f);
  cov = max(cov, 1. - ss(.04, .07, abs(i.uv.x)));
  cov *= 1. - ss(.82, 1., abs(i.uv.x) + .1 * f);
  cov = mix(cov, .85, ss(.15, .38, fw));
  let sharp = sat((cov - .5) / max(fwidth(cov), 1e-4) + .5);
  return select(1., sharp, i.pr.x > .5);
}
@fragment fn fsSh(i: LO) { if (leafCov(i) < .5) { discard; } }
@fragment fn fs(i: LO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  // leaflets: slanted strips either side of the rachis, cut from the frond by alpha (to coverage with MSAA)
  let alpha = leafCov(i);
  let lt = textureSample(tD, sR, vec2f(i.uv.x * .1 + i.sd.x * 3.7, i.uv.y * .6 + i.sd.y * 5.3));
  if ((LOW || g.res.x == 0.) && alpha < .5) { discard; }
  let dist = length(i.wp - g.cam.xyz);
  var n = normalize(i.n); if (!ff) { n = -n; }
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let so = skyOcc(i.wp + vec3f(0., .5, 0.));
  let E = SUNC * mix(shadow1(i.wp + L * .6), 1., .3);
  let ndl = dot(n, L);
  var alb = i.col * (.7 + .3 * ss(0., .3, abs(i.uv.x))) * mix(.75, 1.1, i.uv.y) * (.6 + .8 * lt.b) * (.75 + .5 * lt.a);
  let tr = (max(-ndl, 0.) * .9 + .25) * i.pr.y;
  let trc = alb * vec3f(1.2, 1.25, .55);
    let am = (amb(n, so) + amb(-n, so) * i.pr.y * .45) * (.35 + .65 * so);
  var c = E * (alb * max(ndl, 0.) + trc * tr) + alb * am;
  let H = normalize(V + L);
  c += E * pow(sat(dot(n, H)), 30.) * .25;
  c += E * trc * i.pr.y * pow(sat(dot(-V, L)), 4.) * .8;
  return vec4f(aerial(min(max(c, vec3f(0.)), vec3f(60.)), i.wp), alpha);
}
`;


// ---------------------------------------------------------------- birds (pigeons): flight and flapping in the shader
const W_ANIM = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) @interpolate(flat) sd: f32 };
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  let s = i.b.x; let h = vec3f(hs(s), hs(s + .37), hs(s + .71));
  let R = i.a.w; let t = g.cam.w;
  let ta = t * i.b.y + i.b.w * 6.3 + (h.x - .5) * (14. / R);
  let ph = i.b.w * 17.;
  let P = i.a.xyz + vec3f(R * cos(ta), 4. * sin(2. * ta + ph), R * .8 * sin(ta));
  let T = normalize(vec3f(-R * sin(ta), 8. * cos(2. * ta + ph), R * .8 * cos(ta))) * sign(i.b.y);
  let S = normalize(cross(vec3f(0., 1., 0.), T)); let Up = cross(T, S);
  let off = S * ((h.y - .5) * 9. + sin(t * .5 + s * 40.) * 1.5) + Up * ((h.z - .5) * 5. + cos(t * .4 + s * 31.) * 1.);
  var l = i.p * i.b.z;
  let au = abs(i.n.w);
  let flap = ss(-.3, .4, sin(t * .45 + s * 23.));
  l.y += sin(t * 13. + s * 50.) * .55 * au * au * i.b.z * flap + au * .12 * i.b.z * (1. - flap);
  let w = P + off + S * l.x + Up * l.y + T * l.z;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = S * i.n.x + Up * i.n.y + T * i.n.z; o.op = i.p; o.sd = s;
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n); let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  var alb = mix(vec3f(.30, .32, .36), vec3f(.48, .49, .52), ss(-.02, .02, i.op.y));
  alb = mix(alb, vec3f(.12, .13, .15), ss(.7, .9, abs(i.op.x)));
  alb = mix(alb, alb * vec3f(.7, 1.1, .9), step(.8, hs(i.sd * 3.)) );
  let E = SUNC * shadow1(i.wp);
  var c = alb * (E * (.2 + .8 * sat(dot(n, L))) + amb(n, 1.) * 1.2) + E * pow(sat(dot(n, normalize(V + L))), 20.) * .2;
  return fin(aerial(c, i.wp));
}
`;


// ---------------------------------------------------------------- sky dome behind everything
const W_SKY = S_B + W_NOISE + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) d: vec3f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.d = g.fwd.xyz + g.right.xyz * (p.x * g.right.w) + g.up.xyz * (p.y * g.up.w);
  o.cp = vec4f(p, 1e-9, 1.);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let rd = normalize(i.d); let L = g.sun.xyz; let mu = dot(rd, L);
  var c = skyCol(rd, L);
  // high thin cloud: streaks of cirrus on a plane 6 km up, lit gold toward the sun and rose away from it
  if (rd.y > .004) {
    let q = rd.xz / rd.y * 6000.;
    let r = vec2f(q.x * .96 + q.y * .28, q.y * .96 - q.x * .28) * vec2f(.00011, .00042) + vec2f(g.cam.w * .002, 0.);
    let n = fbm(vec3f(r, 1.3), 5) + .35 * (fbm(vec3f(r * 3.1, 4.1), 3) - .5);
    let cov_ = ss(.6, .86, n) * ss(.03, .2, rd.y) * (1. - ss(.35, .9, rd.y));
    let lit = mix(vec3f(1.15, .80, .78), vec3f(2.5, 1.4, .66), pow(max(mu * .5 + .5, 0.), 4.)) * (.75 + .5 * fbm(vec3f(r * 7., 2.), 2));
    c = mix(c, lit, cov_ * .45);
  }
  c += SUNC * 9. * ss(.99988, .99994, mu);
  return fin(c);
}
`;

// ---------------------------------------------------------------- dust motes and pollen (additive)
const W_SPR = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) pr: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) a: vec4f) -> VO {
  var o: VO; let q = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.; let t = g.cam.w;
  let B = 26.;
  var p = a.xyz * B + vec3f(t * .18, t * .03, t * .07) + .4 * vec3f(sin(t * .3 + a.x * 60.), sin(t * .23 + a.y * 50.), cos(t * .27 + a.z * 70.));
  p = g.cam.xyz + (fract((p - g.cam.xyz) / B + .5) - .5) * B;
  let d = length(p - g.cam.xyz);
  let sz = .006 + .02 * a.w * a.w * a.w;
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * max(sz, d * .0016);
  o.cp = g.vp * vec4f(w, 1.); o.uv = q;
  let fade = ss(B * .5, B * .3, d) * ss(.4, 2., d) * min(1., sz / (d * .0016)) * ss(-2., 1., -abs(p.y - 4.) + 4.) * .3;
  let mu = dot(normalize(p - g.cam.xyz), g.sun.xyz);
  let ph = .15 + 2.2 * pow(max(mu, 0.), 6.);
  o.pr = vec4f(fade * ph * shadow1(p), a.w, 0., 0.);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let m = ss(1., .15, length(i.uv));
  return vec4f(min(SUNC * mix(vec3f(1.), vec3f(1., .9, .6), i.pr.y) * m * m * i.pr.x * .9, vec3f(6.)), 0.);
}
`;


// ---------------------------------------------------------------- sun shafts through the morning dust (half res)
const W_RAYS = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sS: sampler_comparison;
@group(0) @binding(2) var tSh: texture_depth_2d;
@group(0) @binding(3) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dp = textureLoad(tDp, vec2i(fc.xy) * 2, 0);
  let uv = fc.xy * 2. * g.res.zw;
  let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.);
  let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
  let rl = length(rv); let rd = rv / rl;
  let zl = g.fwd.w / max(dp, 1e-6);
  let tm = min(zl * rl, 160.);
  let ro = g.cam.xyz; let sx = g.sun.xyz;
  let dt = tm / ${RAYN}.;
  let j = ign(fc.xy);
  var acc = 0.;
  for (var n = 0; n < ${RAYN}; n++) {
    let t = (f32(n) + j) * dt;
    let p = ro + rd * t;
    let s = g.sm * vec4f(p, 1.);
    let su = vec2f(s.x * .5 + .5, .5 - s.y * .5);
    let inb = ss(0., .01, min(min(su.x, 1. - su.x), min(su.y, 1. - su.y)));
    let vis = mix(1., textureSampleCompareLevel(tSh, sS, su, s.z - .0003), inb);
    let dust = (.10 + exp(-max(p.y, 0.) / 10.) * 1.4) * mix(.3, 1., inb);
    acc += vis * dust * exp(-t * .004);
  }
  let mu = dot(rd, sx);
  let gg = .72;
  let ph = (1. - gg * gg) / pow(1. + gg * gg - 2. * gg * mu, 1.5) * .07 + .1;
  return vec4f(min(SUNC * vec3f(1., .84, .62) * acc * dt * .013 * ph * g.mis.y, vec3f(20.)), zl);
}
`;
// depth-aware 3x3 blur of the half-res shafts (hides the sampling dither)
const W_RBLUR = W_FS + /*wgsl*/`
@group(0) @binding(0) var tR: texture_2d<f32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy); let mx = vec2i(textureDimensions(tR)) - 1;
  let c = textureLoad(tR, p, 0);
  var acc = vec3f(0.); var ws = 0.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let r = textureLoad(tR, clamp(p + vec2i(x, y), vec2i(0), mx), 0);
    let w = 1. / (.03 + abs(r.a - c.a) / c.a);
    acc += r.rgb * w; ws += w;
  } }
  return vec4f(acc / ws, c.a);
}
`;

// ---------------------------------------------------------------- final composite
const W_POST = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tR: texture_2d<f32>;
@group(0) @binding(4) var tB: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
fn tmap(x: vec3f) -> vec3f { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), vec3f(0.), vec3f(1.)); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy);
  let uv = fc.xy * g.res.zw;
  let zf = g.fwd.w / max(textureLoad(tDp, px, 0), 1e-6);
  let h = fc.xy * .5 - .5; let b = floor(h); let f = h - b; let bi = vec2i(b);
  let mx = vec2i(textureDimensions(tR)) - 1;
  var acc = vec3f(0.); var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1);
    let r = textureLoad(tR, clamp(bi + o, vec2i(0), mx), 0);
    let bw = mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y));
    let w = (bw + .02) / (.02 + abs(r.a - zf) / zf);
    acc += r.rgb * w; ws += w;
  }
  var c = textureLoad(tS, px, 0).rgb + acc / ws;
  let bl = textureSampleLevel(tB, sC, uv, 0.).rgb;
  c = mix(c, bl, .025) + bl * .012;
  c *= g.mis.x;
  let q = uv - .5;
  c *= 1. - dot(q, q) * .45;
  c = tmap(c);
  let l0 = dot(c, vec3f(.2126, .7152, .0722));
  let l = mix(l0, l0 * l0 * (3. - 2. * l0), .4);
  c *= l / max(l0, 1e-4);
  c = mix(vec3f(l), c, 1.04) + vec3f(.006, .003, 0.);
  c = pow(max(c, vec3f(0.)), vec3f(1. / 2.2));
  let n = ign(fc.xy) + ign(fc.xy + 37.) - 1.;
  return vec4f(c + n / 255., 1.);
}
`;
