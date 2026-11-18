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
  let plaza = step(-470., x) * step(x, 158.) * step(abs(z), 395.);
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

// ---------------------------------------------------------------- physically based atmosphere (Hillaire 2020)
// Rayleigh + Mie + ozone in km, Earth radius 6360 km. Madinah sits ~600 m up in dusty desert air, so the Mie
// (aerosol) density is a few times the clear-sky value and its absorption leans blue, which is what makes the haze
// warm. The same media drive the sun colour (CPU, below), the sky (LUTs, main.js) and the aerial perspective.
// turb: aerosol multiple of a clear sky. haze: the dusty boundary layer over the city (per km, ~1 km deep) that
// makes Uhud and the far city fade; dust: the 70 m ground layer (dawn mist lies thicker in the hollows)
const ATM = { turb: [7, 8, 12][TOD], haze: [.06, .075, .04][TOD], dust: [1.3, 1, 1][TOD], alt: .62 };
const ATM_BR = [5.802e-3, 13.558e-3, 33.1e-3], ATM_BO = [.65e-3, 1.881e-3, .085e-3];
const ATM_BMS = 3.996e-3 * ATM.turb, ATM_BME = [4.5e-3, 4.75e-3, 5.2e-3].map((v) => v * ATM.turb);
const SUNV = TP.sun.map((c) => c / hypot(...TP.sun));
// sun transmittance from altitude h (km) to space, integrated on the CPU with the same media as the LUTs
const atmT = (h) => {
  const N = 600, r0 = 6360 + h, mu = SUNV[1], R2 = 6460 * 6460;
  const tmax = -r0 * mu + sqrt(r0 * r0 * (mu * mu - 1) + R2), dt = tmax / N, od = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const t = (i + .5) * dt, x = t * sqrt(1 - mu * mu), y = r0 + t * mu, hh = hypot(x, y) - 6360;
    const dr = exp(-hh / 8), dm = exp(-hh / 1.2), dz = max(0, 1 - abs(hh - 25) / 15);
    for (let c = 0; c < 3; c++) od[c] += (ATM_BR[c] * dr + ATM_BME[c] * dm + ATM_BO[c] * dz) * dt;
  }
  return od.map((v) => exp(-v));
};
// the solar scale keeps each preset's sun brightness; the hue now comes from the air it passes through. At night the
// moon gets a blue Purkinje tint, as the eye sees moonlight, so the night keeps its look.
const ATM_TS = atmT(ATM.alt), ATM_T6 = atmT(6), lum3 = (v) => v[0] * .2126 + v[1] * .7152 + v[2] * .0722;
const ATM_NT = TP.night ? [.62, .78, 1.3] : [1, 1, 1];
const ATM_S = lum3(TP.sunc) / lum3(ATM_TS);
const SUNCP = ATM_TS.map((v, c) => v * ATM_S * ATM_NT[c] * (TP.night ? .7 : 1)), CLOUDSUN = ATM_T6.map((v, c) => v * ATM_S * ATM_NT[c]);
const f3 = (v) => v.map((x) => x.toPrecision(5)).join(', ');
const W_ATMC = /*wgsl*/`
const RG = 6360.; const RT = 6460.; const HR = 8.; const HM = 1.2; const MG = .76;
const BR = vec3f(${f3(ATM_BR)}); const BO = vec3f(${f3(ATM_BO)});
const BMS = vec3f(${ATM_BMS.toPrecision(5)}); const BME = vec3f(${f3(ATM_BME)});
const SUNL = vec3f(${f3(SUNV)}); const ALT = ${ATM.alt};
const PI = 3.1415927;
struct Md { sr: vec3f, sm: vec3f, e: vec3f };
fn medium(h: f32) -> Md {
  let dr = exp(-h / HR); let dm = exp(-h / HM);
  return Md(BR * dr, BMS * dm, BR * dr + BME * dm + BO * max(0., 1. - abs(h - 25.) / 15.));
}
fn phR(mu: f32) -> f32 { return .0596831 * (1. + mu * mu); }
fn phG(mu: f32, g: f32) -> f32 { let g2 = g * g; return .1193662 * (1. - g2) * (1. + mu * mu) / ((2. + g2) * pow(max(1. + g2 - 2. * g * mu, 1e-4), 1.5)); }
fn phM(mu: f32) -> f32 { return phG(mu, MG); }
fn tUV(r: f32, mu: f32) -> vec2f {
  let H = sqrt(RT * RT - RG * RG); let rho = sqrt(max(r * r - RG * RG, 0.));
  let d = max(-r * mu + sqrt(max(r * r * (mu * mu - 1.) + RT * RT, 0.)), 0.);
  let dmin = RT - r; let dmax = rho + H;
  return vec2f((d - dmin) / (dmax - dmin), rho / H);
}
// sky-view LUT: u = azimuth from the sun's vertical plane (0..pi, the sky is symmetric about it), v = elevation,
// squeezed toward the horizon where the colour changes fastest
fn svUV(rd: vec3f) -> vec2f {
  let h = vec2f(rd.x, rd.z); let s = vec2f(SUNL.x, SUNL.z);
  let az = acos(clamp(dot(h, s) / max(length(h) * length(s), 1e-5), -1., 1.)) / PI;
  let e = asin(clamp(rd.y, -1., 1.)) / (PI * .5);
  return vec2f(az, .5 + .5 * sign(e) * sqrt(abs(e)));
}
`;
// LUT passes, run once at load (the sun does not move)
const W_ATMLUT = W_FS + W_ATMC + /*wgsl*/`
@group(0) @binding(0) var tT: texture_2d<f32>;
@group(0) @binding(1) var tM: texture_2d<f32>;
@group(0) @binding(2) var sL: sampler;
fn trans(r: f32, mu: f32) -> vec3f {
  if (mu < 0. && r * r * (mu * mu - 1.) + RG * RG >= 0.) { return vec3f(0.); }
  return textureSampleLevel(tT, sL, tUV(r, mu), 0.).rgb;
}
fn hitR(r: f32, mu: f32, R: f32) -> f32 { let d = r * r * (mu * mu - 1.) + R * R; return select(-1., -r * mu - sqrt(max(d, 0.)), d >= 0.); }
fn tmaxOf(r: f32, mu: f32) -> f32 {
  let g = hitR(r, mu, RG);
  if (mu < 0. && g > 0.) { return g; }
  return -r * mu + sqrt(max(r * r * (mu * mu - 1.) + RT * RT, 0.));
}
@fragment fn fsT(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(256., 64.);
  let H = sqrt(RT * RT - RG * RG); let rho = H * uv.y; let r = sqrt(rho * rho + RG * RG);
  let dmin = RT - r; let dmax = rho + H; let d = dmin + uv.x * (dmax - dmin);
  let mu = clamp(select((H * H - rho * rho - d * d) / (2. * r * d), 1., d <= 0.), -1., 1.);
  var od = vec3f(0.); let dt = d / 40.;
  for (var i = 0; i < 40; i++) {
    let t = (f32(i) + .5) * dt; let hh = sqrt(r * r + t * t + 2. * r * mu * t) - RG;
    od += medium(hh).e * dt;
  }
  return vec4f(exp(-od), 1.);
}
// multiple scattering (Hillaire 2020 sec. 5.5): second-order light from 64 directions, as a geometric series
@fragment fn fsM(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / 32.; let mus = uv.x * 2. - 1.; let r = RG + uv.y * (RT - RG) + .01;
  let sd = vec3f(sqrt(1. - mus * mus), mus, 0.);
  var L2 = vec3f(0.); var fm = vec3f(0.);
  for (var i = 0; i < 8; i++) { for (var j = 0; j < 8; j++) {
    let th = PI * 2. * (f32(i) + .5) / 8.; let ph = acos(1. - 2. * (f32(j) + .5) / 8.);
    let rd = vec3f(cos(th) * sin(ph), cos(ph), sin(th) * sin(ph));
    let tm = tmaxOf(r, rd.y); let dt = tm / 20.;
    var T = vec3f(1.); var L = vec3f(0.); var f = vec3f(0.);
    for (var k = 0; k < 20; k++) {
      let p = vec3f(0., r, 0.) + rd * (f32(k) + .5) * dt; let pr = length(p);
      let m = medium(pr - RG); let s = m.sr + m.sm; let e = max(m.e, vec3f(1e-7));
      let st = trans(pr, dot(p / pr, sd));
      let x = (vec3f(1.) - exp(-e * dt)) / e;
      L += T * s * st * .0795775 * x; f += T * s * x;
      T *= exp(-e * dt);
    }
    if (hitR(r, rd.y, RG) > 0. && rd.y < 0.) {
      let gp = vec3f(0., r, 0.) + rd * tm; let gn = normalize(gp);
      L += T * trans(RG, dot(gn, sd)) * max(dot(gn, sd), 0.) * .3 / PI;
    }
    L2 += L / 64.; fm += f / 64.;
  } }
  return vec4f(L2 / (vec3f(1.) - fm), 1.);
}
@fragment fn fsS(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(192., 108.);
  let az = uv.x * PI; let v = uv.y * 2. - 1.; let e = sign(v) * v * v * PI * .5;
  let sh = normalize(vec2f(SUNL.x, SUNL.z)); let ch = vec2f(-sh.y, sh.x);
  let hd = sh * cos(az) + ch * sin(az);
  let rd = vec3f(hd.x * cos(e), sin(e), hd.y * cos(e));
  let r = RG + ALT; let tm = tmaxOf(r, rd.y); let mu = dot(rd, SUNL);
  let pR = phR(mu); let pM = phM(mu);
  var T = vec3f(1.); var L = vec3f(0.); var t0 = 0.;
  for (var k = 0; k < 40; k++) {
    let t1 = tm * pow((f32(k) + 1.) / 40., 2.); let dt = t1 - t0; let t = (t0 + t1) * .5; t0 = t1;
    let p = vec3f(0., r, 0.) + rd * t; let pr = length(p); let up = p / pr;
    let m = medium(pr - RG); let e = max(m.e, vec3f(1e-7));
    let ms = textureSampleLevel(tM, sL, vec2f(dot(up, SUNL) * .5 + .5, (pr - RG) / (RT - RG)), 0.).rgb;
    let S = (m.sr * pR + m.sm * pM) * trans(pr, dot(up, SUNL)) + (m.sr + m.sm) * ms;
    L += T * S * (vec3f(1.) - exp(-e * dt)) / e;
    T *= exp(-e * dt);
  }
  return vec4f(L, 1.);
}
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
// amb: sky light on an up-facing white surface, integrated from the sky-view LUT at load
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f, sun: vec4f, res: vec4f, mis: vec4f, pvp: mat4x4f, jit: vec4f, amb: vec4f };
const LUMA = vec3f(.2126, .7152, .0722);
const SUNC = vec3f(${f3(SUNCP)}); const CLOUDSUN = vec3f(${f3(CLOUDSUN)});
// sky radiance per unit of the LUT: pi * solar scale, because surfaces here take SUNC as irradiance / pi
const SKYS = vec3f(${f3(ATM_NT.map((v) => v * ATM_S * PI * (TP.night ? .45 : 1)))});
const BAND = vec3f(${TP.band.join(', ')}); const ROSE = vec3f(${TP.rose.join(', ')}); const AMBC = vec3f(${TP.ambc.join(', ')});
const GND = ${TP.gnd}; const LIGHTS = ${TP.lights}; const LITF = ${TP.litf}; const NIGHT = ${TP.night}.;
const TAU = 6.2831853;
const LOW = ${LV > 1};
const FAC = ${FAC}.; const MZ0 = ${MZ0}.; const MZ1 = ${MZ1}.; const ROOF = ${ROOF}.;
const UX0 = ${UX0}.; const UZ0 = ${UZ0}.; const USP = ${USP}.; const UNX = ${UNX}.; const UNZ = ${UNZ}.;
const UGATE = vec2f(${UGATE[0]}., ${UGATE[1]}.); const UDUR = 20.; const UR = 13.3; const UH = 13.75;
const ARCX = vec2f(${ARCX[0]}., ${ARCX[1]}.); const ARCZ = vec2f(${ARCZ[0]}., ${ARCZ[1]}.);
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(.06711056, .00583715)))); }
fn hs(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn h2(p: vec2f) -> f32 { var q = fract(vec3f(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn fin(c: vec3f) -> vec4f { return vec4f(min(max(c, vec3f(0.)), vec3f(60.)), 1.); }
// box-filtered coverage of a line of half width w at distance d, for a pixel footprint fw
fn cov(d: f32, w: f32, fw: f32) -> f32 { let h = max(fw, 1e-4) * .5; return max(min(w, d + h) - max(-w, d - h), 0.) / (2. * h); }
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

const S_B = S_G + W_ATMC + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var sC: sampler;
@group(0) @binding(3) var sS: sampler_comparison;
@group(0) @binding(4) var tSh: texture_depth_2d;
@group(0) @binding(5) var tD: texture_2d<f32>;
@group(0) @binding(8) var tF: texture_2d<f32>;
@group(0) @binding(9) var tSV: texture_2d<f32>;
@group(0) @binding(10) var tMS: texture_2d<f32>;
// sky radiance in direction rd, from the sky-view LUT. Kept from the old painted sky: the rose band low opposite
// the sun at dawn and golden hour, the city's light dome on the horizon at night, and lit ground below the horizon.
fn skyCol(rd: vec3f, sun: vec3f) -> vec3f {
  let y = max(rd.y, 0.);
  let h = vec2f(rd.x, rd.z); let tw = .5 + .5 * dot(h / max(length(h), 1e-4), normalize(sun.xz));
  var c = textureSampleLevel(tSV, sC, svUV(rd), 0.).rgb * SKYS;
  c += ROSE * .5 * ss(.0, .06, y) * ss(.26, .08, y) * (1. - tw) * (1. - tw);
  c += BAND * .32 * pow(sat(1. - y * 4.), 3.) * (.5 + .5 * tw) * NIGHT;
  return mix(c, vec3f(.50, .45, .40) * (SUNC * max(sun.y, 0.) + g.amb.xyz) * GND, sat(-rd.y * 5.));
}
// aerial perspective from the same media, in closed form: optical depth of each exponential layer along the ray,
// single scattering of the sun (Rayleigh and Mie phase) plus the LUT's multiple scattering, a 70 m dust layer over
// the ground and a ~1 km boundary-layer haze. Far away it hands over to the sky LUT so the horizon has no seam.
struct Air { t: vec3f, i: vec3f };
const DUST = vec3f(.8e-4, .86e-4, .95e-4) * ${ATM.dust};
// dust absorbs a little more blue than red, which is what warms the haze
const HAZE = vec3f(.9, 1., 1.12) * ${ATM.haze};
fn airAt(cam: vec3f, wp: vec3f, sun: vec3f) -> Air {
  let v = wp - cam; let d = max(length(v), 1e-3); let rd = v / d;
  let hc = max(cam.y, -30.) * 1e-3 + ALT; let dk = d * 1e-3;
  let kr = rd.y / HR; let km = rd.y / HM; let k2 = rd.y / 70.;
  let odR = select((1. - exp(-kr * dk)) / kr, dk, abs(kr) < 1e-6) * exp(-hc / HR);
  let odM = select((1. - exp(-km * dk)) / km, dk, abs(km) < 1e-6) * exp(-hc / HM);
  let od2 = select((1. - exp(-k2 * d)) / k2, d, abs(k2) < 1e-7) * exp(-max(cam.y, -30.) / 70.);
  let kh = rd.y / 1.;
  let odH = select((1. - exp(-kh * dk)) / kh, dk, abs(kh) < 1e-6) * exp(-max(cam.y, -30.) * 1e-3);
  let sR = BR * odR; let sM = BMS * odM; let sD = DUST * .9 * od2 + HAZE * .85 * odH;
  let tau = sR + BME * odM + DUST * od2 + HAZE * odH;
  let T = exp(-tau);
  let mu = dot(rd, sun);
  let ms = textureSampleLevel(tMS, sC, vec2f(sun.y * .5 + .5, ALT / (RT - RG)), 0.).rgb;
  var ins = (SUNC * PI * (sR * phR(mu) + sM * phM(mu) + sD * phG(mu, .45)) + SKYS * ms * (sR + sM + sD)) * (vec3f(1.) - T) / max(tau, vec3f(1e-7));
  ins = mix(ins, skyCol(normalize(vec3f(rd.x, max(rd.y, 0.) * .3 + .012, rd.z)), sun) * (vec3f(1.) - T), ss(4000., 16000., d));
  return Air(T, ins);
}
fn aerialAt(c: vec3f, cam: vec3f, wp: vec3f, sun: vec3f) -> vec3f { let a = airAt(cam, wp, sun); return c * a.t + a.i; }
fn shUV(p: vec3f) -> vec3f { let s = g.sm * vec4f(p, 1.); return vec3f(s.x * .5 + .5, .5 - s.y * .5, s.z - .0003); }
// 1 inside the shadow map's footprint, fading to unshadowed outside it
fn shK(s: vec3f) -> f32 { let e = min(min(s.x, 1. - s.x), min(s.y, 1. - s.y)); return ss(0., .01, e) * step(s.z, 1.); }
fn shadow1(p: vec3f) -> f32 {
  let s = shUV(p);
  return mix(1., textureSampleCompareLevel(tSh, sS, s.xy, s.z), shK(s));
}
fn shadow9(p: vec3f) -> f32 {
  if (LOW) { return shadow1(p); }
  let s = shUV(p); let e = 1.25 / ${SHADOW}.; var a = 0.;
  let r = h2(floor(p.xz * 61.) + floor(p.y * 47.)) * TAU; let cr = cos(r); let sr = sin(r);
  for (var x = 0; x < 4; x++) { for (var y = 0; y < 4; y++) { let o = vec2f(f32(x), f32(y)) - 1.5; a += textureSampleCompareLevel(tSh, sS, s.xy + vec2f(o.x * cr - o.y * sr, o.x * sr + o.y * cr) * e, s.z); } }
  return mix(1., a / 16., shK(s));
}
// how much open sky a point sees: less under an open canopy, at the foot of a column, by the facade, in the arcade
fn skyOcc(p: vec3f) -> f32 {
  let u = uCell(p.xz);
  let inside = (1. - ss(10.5, 13.5, max(abs(u.x), abs(u.y)))) * ss(16., 13.5, p.y);
  var o = 1. - .3 * uOpen(g.mis.w, uDelay(u.zw)) * inside;
  o *= mix(.78, 1., ss(.9, 2.8, length(u.xy) + p.y * .4));
  let fz = step(MZ0, p.z) * step(p.z, MZ1);
  o *= mix(1., mix(.55, 1., ss(0., 6., p.x - FAC)), fz * ss(ROOF + 2., ROOF - 4., p.y));
  let ax = ss(ARCX.x - .5, ARCX.x + 1.5, p.x) * ss(ARCX.y + .5, ARCX.y - 1.5, p.x) * step(ARCZ.x, p.z) * step(p.z, ARCZ.y) * step(p.y, 7.3);
  let wd = min(abs(p.x - ARCX.x - 1.), abs(p.x - ARCX.y + 1.));
  return o * (1. - .65 * ax) * mix(.82, 1., sat(ss(0., 1., wd + p.y * 1.5) + (1. - ax)));
}
fn amb(n: vec3f, sky: f32) -> vec3f {
  let up = n.y * .5 + .5;
  return g.amb.xyz * up * up * (.35 + .65 * sky) + AMBC * (vec3f(.86, .78, .68) * .72 * (1. - up) * (.65 + .35 * sky) + vec3f(.12, .11, .10) * (.5 + .5 * sky));
}
fn aerial(c: vec3f, wp: vec3f) -> vec3f { return aerialAt(c, g.cam.xyz, wp, g.sun.xyz); }
// second target: the share of the pixel's light that is ambient (sky and bounce), so screen-space AO can darken
// only that part and never the sunlit or emissive part
struct FO { @location(0) c: vec4f, @location(1) a: vec4f };
fn outA(c: vec3f, amb: vec3f, wp: vec3f, alpha: f32) -> FO {
  let air = airAt(g.cam.xyz, wp, g.sun.xyz);
  let col = min(max(min(max(c, vec3f(0.)), vec3f(60.)) * air.t + air.i, vec3f(0.)), vec3f(60.));
  return FO(vec4f(col, alpha), vec4f(sat(dot(amb * air.t, LUMA) / max(dot(col, LUMA), 1e-5))));
}
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
  if (dv <= 0.) { return vec2f(1e3, 0.); }
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
  let border = cov(db, .75, fw);
  let pin = max(cov(abs(db - .85), .07, fw), cov(abs(star), .11, fw));
  let inner = cov(abs(star + .55), .05, fw);
  let oct = max(max(aq.x, aq.y), (aq.x + aq.y) * .70711) - 8.6;
  let cd = (USP - aq.x - aq.y) - 3.2;
  let dia = sat(-cd / max(fw, 1e-3) + .5);
  let diag = cov(dg, .07, fw) * ss(.0, .3, star - .2) * ss(1.2, 1.5, db);
  let uc = uCell(p);
  let ring = sat((1.45 - length(uc.xy)) / max(fw, 1e-3) + .5) * step(uDelay(uc.zw), 1e3);
  let sl = p / 1.2; let jd = abs(fract(sl) - .5) * 1.2;
  let joint = max(cov(.6 - jd.x, .0025, fw), cov(.6 - jd.y, .0025, fw));
  let id = floor(sl); let hh = h2(id);
  var col = mix(vec3f(.76, .735, .69), vec3f(.74, .69, .615), step(.82, hh) * .6) * (.96 + .08 * hh);
  col = mix(col, vec3f(.62, .61, .60), vein * .22 * (1. - border));
  col = mix(col, vec3f(.73, .66, .56), sat(-star / max(fw, 1e-3) + .5) * sat((star + .55) / max(fw, 1e-3) + .5) * .85);
  col = mix(col, vec3f(.70, .62, .52), dia * .8);
  col = mix(col, vec3f(.64, .48, .30), max(max(pin, inner), max(cov(abs(oct), .09, fw), cov(abs(cd), .08, fw))));
  col = mix(col, vec3f(.40, .40, .41), cov(abs(cd + 1.1), .22, fw));
  col = mix(col, vec3f(.30, .30, .315), max(border, diag));
  col = mix(col, vec3f(.44, .43, .42), ring);
  col *= 1. - .35 * joint;
  let pave = vec3f(.47, .44, .40) * (.9 + .1 * h2(floor(p / 2.4)));
  return mix(vec4f(pave * (1. - .3 * max(cov(1.2 - abs(fract(p.x / 2.4) - .5) * 2.4, .01, fw), cov(1.2 - abs(fract(p.y / 2.4) - .5) * 2.4, .01, fw))), .1), vec4f(col, mix(.9, .75, max(border, ring))), inPlaza);
}
// what the polished floor mirrors: the lit east facade, the undersides of the open canopies, otherwise the sky
fn floorRefl(p: vec3f, R: vec3f) -> vec3f {
  var col = mix(skyCol(R, g.sun.xyz), vec3f(.72, .66, .64), .3); var tm = 1e9;
  if (R.x < -1e-3) {
    let t = (FAC + .3 - p.x) / R.x; let q = p + R * t;
    let k = ss(ROOF + 3., ROOF - 4., q.y) * ss(MZ0 - 15., MZ0 + 15., q.z) * ss(MZ1 + 15., MZ1 - 15., q.z) * ss(260., 60., t);
    col = mix(col, vec3f(.80, .74, .64) * (SUNC * .5 + vec3f(.35, .34, .36)), k);
    if (k > .5) { tm = t; }
  }
  if (R.y > 1e-3) {
    let t = (15. - p.y) / R.y;
    if (t < tm) {
      let q = p + R * t; let u = uCell(q.xz);
      let k = uOpen(g.mis.w, uDelay(u.zw)) * (1. - ss(10.5, 13.5, max(abs(u.x), abs(u.y)))) * ss(200., 40., t);
      col = mix(col, vec3f(.95, .84, .70) * .9, k);
    }
  }
  return col;
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> FO {
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
    alb = select(vec3f(.72, .675, .595), ct, mat == 17) * (.86 + .2 * B.h) * (.94 + .1 * C.c);
    if (mat == 17) {
      let bw = mix(2.6, 4.6, hs(sd * 11.)); let ww = mix(.18, .34, hs(sd * 13.));
      let wx = fract(fu / bw); let wy = fract(fv / 3.3); let flr = floor(fv / 3.3); let bay = floor(fu / bw);
      let win = step(.5 - ww, wx) * step(wx, .5 + ww) * step(.3, wy) * step(wy, .74) * step(1., flr) * wall * step(fv, i.m.w - 1.) * wfade * step(.15, hs(bay * 3.1 + flr * 5.7 + sd));
      let lit = step(LITF, hs(flr * 13.1 + bay * 7.7 + sd * 31.));
      alb = mix(alb, vec3f(.07, .08, .09), win * .9);
      alb = mix(alb, alb * vec3f(.82, .8, .78), (1. - wfade) * wall * .5);
      emi = vec3f(1., .62, .30) * .5 * win * lit * LIGHTS;
      alb = mix(alb, alb * vec3f(.5, .47, .45), ss(.6, .9, on.y));
      gloss = mix(.08, .55, win);
    } else {
      let a1 = arcade(fu, fv, 6., 6.5, .7) * wall * step(.5, i.m.w) * step(on.x, .7);
      let a2 = arcade(fu + 3., fv, 3., 2., 12.5) * wall * step(fv, 17.) * step(.5, i.m.w) * step(on.x, .7);
      alb = mix(alb, vec3f(.05, .045, .04), max(a1, a2) * .92);
      let band = ss(.9, .96, fract(fv / 8.7)) * wall;
      alb = mix(alb, alb * vec3f(.9, .84, .74), band * .6);
      let seam = 1. - ss(.0, .04, abs(fract(i.op.x / 12.) - .5) * 2. - .9) * ss(.0, .04, abs(fract(i.op.z / 12.) - .5) * 2. - .9);
      let chk = f32((i32(floor(i.op.x / 12.)) + i32(floor(i.op.z / 12.))) & 1);
      alb = mix(alb, vec3f(.70, .67, .62) * (1. - .25 * seam) * (.88 + .2 * B.c) * (1. - .06 * chk), ss(.6, .9, on.y));
    }
    bump = .05;
  } else if (mat == 25 || mat == 20) {
    // carved pale stone: ashlar courses, and black-and-white voussoirs round every arch
    // dressed stone is never one flat white: broad weather stains and block-to-block tone give the eye edges in full sun
    alb = select(vec3f(.70, .645, .555), vec3f(.72, .675, .595), mat == 20) * (.86 + .2 * B.h) * (.92 + .14 * C.c) * mix(1., .86, ss(.5, .82, A.c));
    let cj = max(cov(abs(fract(fv / .62) - .5) * .62 - .3, .006, fw3), cov(abs(fract(fu / 1.24 + floor(fv / .62) * .5) - .5) * 1.24 - .61, .006, fw3)) * wall;
    alb *= 1. - .3 * cj;
    if (mat == 25 && on.y < -.7 && i.wp.x > 80.) {
      let bm = cov(abs(fract(i.wp.z / 2.5) - .5) * 2.5, .14, fw3);
      alb = mix(vec3f(.76, .71, .62), vec3f(.62, .53, .42), bm);
    }
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
      alb = mix(alb, select(vec3f(.76, .735, .67), vec3f(.13, .12, .12), odd), vb);
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
        alb = mix(alb, mix(alb * .6, vec3f(.04, .035, .03), lantern), inN);
        emi += vec3f(1., .66, .32) * 2.5 * inN * lantern;
        alb = mix(alb, alb * vec3f(.9, .82, .7), cov(max(ad.x, 0.) - .1, .07, fw3) * step(st.x, y));
      }
      let bal = select(vec3f(48.4, 66.6, 78.8), vec3f(39.6, 51.6, 54.3), i.m.w > 1.5);
      for (var b = 0; b < 3; b++) { emi += vec3f(1., .62, .3) * .7 * ss(bal[b] - .4, bal[b] + .6, y) * ss(bal[b] + 2.1, bal[b] + 1.3, y) * step(on.y, -.1); }
      alb = mix(alb, alb * vec3f(.88, .82, .72), cov(abs(fract(y / 3.05) - .5) * 3.05 - 1.48, .05, fw3) * step(24., y));
    }
    bump = .05; gloss = .12;
  } else if (mat == 8) {
    let rib = ss(.38, .5, abs(fract(atan2(i.op.z, i.op.x) / TAU * 32.) - .5)) * .5;
    alb = vec3f(.035, .22, .11) * (1. - rib) * (.92 + .16 * B.h); gloss = .32; bump = .05;
    let drum = step(i.op.y, 4.3);
    let wa = fract(atan2(i.op.z, i.op.x) / TAU * 16.) - .5;
    let wn = step(abs(wa), .14) * step(1., i.op.y) * step(i.op.y, 3.3 + .5 * sqrt(sat(1. - wa * wa * 51.))) * drum;
    alb = mix(alb, vec3f(.03, .04, .035), wn);
    alb = mix(alb, vec3f(.78, .64, .32), cov(abs(i.op.y - 4.4), .12, fw3) * .8); metal = mix(0., .8, cov(abs(i.op.y - 4.4), .12, fw3));
  } else if (mat == 9) {
    let pan = cov(abs(fract(atan2(i.op.z, i.op.x) / TAU * 48.) - .5) * TAU / 48. * length(i.op.xz), .04, fw3);
    alb = vec3f(.46, .48, .51) * (.92 + .12 * B.h) * (1. - .3 * pan); gloss = .75; metal = .8; bump = .1;
  } else if (mat == 10) {
    alb = vec3f(1., .72, .30); gloss = .9; metal = 1.; bump = 0.;
  } else if (mat == 11) {
    alb = vec3f(.66, .66, .64) * (.92 + .1 * B.h); gloss = .2; bump = .1;
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
    let m = marble(i.wp.xz, fwp, (1. - ss(.0, .05 + fwp * .5, abs(vt.b - .52))) * .55 + ss(.45, .75, vt.a) * .08);
    alb = m.rgb; polish = m.a * .5; bump = 0.; gloss = .6;
  } else if (mat == 21) {
    // closed brass lattice screens (w 0) and brass doors with raised panels and studs (w 1), dark behind
    let u = i.wp.z; let v = i.wp.y;
    if (i.m.w < .5) {
      let c = vec2f(u, v) / .42; let q = abs(fract(c) - .5) * .42; let qd = abs(fract(c + .5) - .5) * .42;
      let bars = max(max(cov(q.x, .028, fw3), cov(q.y, .028, fw3)), cov(abs(qd.x + qd.y - .21) * .7071, .022, fw3));
      alb = mix(vec3f(.10, .07, .045), vec3f(.55, .40, .18), bars); metal = .6 * bars; gloss = .4 * bars;
    } else {
      let c = vec2f(u / .8, (v - .4) / 1.05); let q = abs(fract(c) - .5) * vec2f(.8, 1.05);
      let fr = max(cov(q.x - .37, .04, fw3), cov(q.y - .49, .04, fw3));
      let st = cov(length(abs(fract(vec2f(u, v) / .2) - .5) * .2), .025, fw3) * (1. - fr);
      alb = vec3f(.34, .24, .11) * (1. - .6 * fr) * (1. + .6 * st); metal = .6; gloss = .5;
    }
    bump = .02;
  } else if (mat == 22) {
    alb = vec3f(.9, .85, .7); emi = vec3f(2.6, 1.75, .95) * 2.2; gloss = .8;
  } else if (mat == 23) {
    alb = vec3f(.50, .38, .19) * (.9 + .2 * B.h); metal = .75; gloss = .6; bump = .1;
  } else if (mat == 24) {
    alb = vec3f(.74, .74, .72) * (.96 + .05 * B.h); gloss = .35; bump = .02;
  } else if (mat == 27) {
    alb = mix(vec3f(.46, .45, .45), vec3f(.60, .59, .57), ss(.4, .7, C.c)) * (.88 + .24 * hs(floor(C.h * 9.))); gloss = .55; bump = .15;
  }
  // night: the Masjid is floodlit, its domes and finials glow, the umbrella fabric is lit from inside
  if (NIGHT > .5) {
    var k = 0.;
    if (mat == 25 || mat == 20 || mat == 7) { k = mix(.12, .04, ss(0., 14., i.wp.y)); } else if (mat == 8 || mat == 10) { k = 1.5; } else if (mat == 9) { k = .35; } else if (mat == 11) { k = .3; } else if (mat == 19) { k = .03; }
    emi += alb * k;
  }
  let N = normalize(qrot(i.q, normalize(on + (A.n * .8 + B.n * .6 + C.n * .4 * ss(70., 10., dist)) * bump)));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let so = select(skyOcc(i.wp + n0 * .3), 1., far || mat == 17);
  var ao = so * vao * select(1., i.ao, far || mat >= 20 || mat == 12);
  let sh = select(shadow9(i.wp + n0 * (.2 + dist * .003) + g.sun.xyz * .15), sat(i.ao * 1.6 - .3), far);
  let E = SUNC * sh;
  let ndl = sat(dot(N, L));
  let uc = uCell(i.wp.xz);
  let under = uOpen(g.mis.w, uDelay(uc.zw)) * (1. - ss(11., 14., max(abs(uc.x), abs(uc.y)))) * ss(15.5, 12., i.wp.y) * f32(!far);
  let am = (amb(N, so) + (AMBC * vec3f(.95, .86, .74) * .42 + vec3f(1., .78, .5) * .3 * NIGHT) * under * sat(N.y * .5 + .6)) * ao;
  var c = alb * (E * ndl + am) + emi;
  let Hh = normalize(V + L);
  let spc = mix(vec3f(.04), alb, metal);
  c += E * spc * pow(sat(dot(N, Hh)), mix(8., 160., gloss)) * gloss * ndl * 4.;
  var ambS = alb * am;
  if (mat == 19) {
    // polished marble: a Fresnel mirror of the facade, the canopies and the sky, plus the sun's glint
    let Rr = reflect(-V, N); let fr = .04 + .96 * pow(1. - sat(dot(N, V)), 5.);
    let rf = floorRefl(i.wp, Rr) * fr * polish * mix(.6, 1., so);
    c = c * (1. - fr * polish) + rf; ambS = ambS * (1. - fr * polish) + rf;
  } else {
    let rf = skyCol(reflect(-V, N), L) * ao * spc * gloss * pow(1. - sat(dot(N, V)), 3.) * 1.5;
    c += rf; ambS += rf;
  }
  return outA(c, ambS, i.wp, 1.);
}
`;

// ---------------------------------------------------------------- umbrella membranes, opening in the vertex shader
// Each instance (x, z, delay, seed) draws a 64 x 14 grid of the membrane around its column head. Closed, the arms
// stand up in a slim pleated bud about 21 m tall; opening, they swing out and down while the fabric stretches into
// a square tulip 25.5 m across, corners highest. The shadow pass uses the same vertex shader.
const W_UMB = S_B + /*wgsl*/`
struct UO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) @interpolate(flat) k: vec2f };
const NA = 64.; const NR = 14.;
fn mem(a: f32, s: f32, e: f32, sd: f32) -> vec3f {
  let L = UR / max(abs(cos(a)), abs(sin(a))); let cn = sat((L - UR) / (UR * .4142));
  let sg = sin(4. * a);
  let ro = .7 + s * (L - .7); let vo = .25 + (1. + .35 * sd) * pow(s, 1.25) + (.75 + .4 * fract(sd * 7.3)) * s * s * cn - .2 * s * sg * sg;
  let rc = (.3 + .7 * pow(max(sin(3.1416 * min(s * 1.06, 1.)), 0.), .7) * (1. - .35 * s)) * (.42 + .58 * pow(abs(cos(4. * a)), 1.5));
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
  let P = mem(a, s, e, ins.w); let P1 = mem(a, s1, e, ins.w);
  let n = normalize(cross(mem(a + .01, s1, e, ins.w) - P1, mem(a, s1 + .01, e, ins.w) - P1));
  let w = vec3f(ins.x, UH, ins.y) + P;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = n; o.uv = vec2f(a, s); o.k = vec2f(e, ins.w);
  return o;
}
@fragment fn fs(i: UO) -> FO {
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let ng = normalize(i.n); let top = dot(ng, V) > 0.; let n = select(-ng, ng, top);
  let a = i.uv.x; let s = i.uv.y; let e = i.k.x;
  let Le = UR / max(abs(cos(a)), abs(sin(a))) * s * mix(.15, 1., e);
  let seamD = abs(fract(a / TAU * 32. + .5) - .5) * TAU / 32. * Le;
  let armD = abs(fract(a / TAU * 8. + .5) - .5) * TAU / 8. * Le;
  let fw = fwidth(seamD) + fwidth(s) * 4.;
  let dc = length(i.wp - g.cam.xyz);
  let seam = cov(seamD, .02, fw) * ss(.1, .3, s) * (1. - ss(50., 160., dc));
  let fold = (1. - pow(abs(cos(4. * a)), 1.5)) * (1. - e) * ss(.05, .3, s);
  let arm = cov(armD, .1, fw) * ss(.06, .2, s) * f32(!top) * ss(.2, .6, e);
  let hem = cov(1. - s, .012, fwidth(s) * 1.5) * (1. - ss(60., 200., dc));
  let sunSide = select(-1., 1., dot(ng, L) > 0.);
  let Es = SUNC * shadow9(i.wp + ng * sunSide * .4);
  let ndl = abs(dot(ng, L));
  let lit = select(.55, 1., select(-1., 1., top) == sunSide);
  let so = skyOcc(i.wp + n * 1.5);
  var alb = vec3f(.78, .77, .745) * (1. - .2 * seam) * (.97 + .06 * h2(vec2f(floor(a / TAU * 32.), i.k.y * 91.)));
  // light bounced up from the marble: it follows the sun and sky, so at night only the floodlit floor feeds it
  let bounce = vec3f(.98, .86, .70) * .5 * mix(1., .3, NIGHT) * sat(-n.y) * mix(.6, 1., e);
  var c = alb * (Es * ndl * lit + amb(n, so) + bounce);
  c += Es * pow(sat(dot(n, normalize(V + L))), 40.) * .08 * f32(top);
  c = mix(c, vec3f(.55, .55, .56) * (amb(n, so) + bounce * .6), arm);
  c = mix(c, c * .6, hem);
  c *= 1. - .45 * fold;
  return outA(c, alb * (amb(n, so) + bounce) * (1. - .45 * fold), i.wp, 1.);
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
    case 0 { col = mix(vec3f(.09, .13, .045), vec3f(.17, .18, .07), s1); pr = vec4f(1., .4, 0., 0.); fold = .5; }
    case 1 { col = mix(vec3f(.20, .14, .075), vec3f(.28, .20, .10), s1); pr = vec4f(1., .3, 0., 0.); fold = .3; }
    case 2 { col = mix(vec3f(.11, .15, .06), vec3f(.20, .22, .09), s1); pr = vec4f(0., .8, 0., 0.); }
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
@fragment fn fs(i: LO, @builtin(front_facing) ff: bool) -> FO {
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
  let trc = alb * vec3f(1., 1.02, .6);
    let am = (amb(n, so) + amb(-n, so) * i.pr.y * .45) * (.35 + .65 * so);
  var c = E * (alb * max(ndl, 0.) + trc * tr) + alb * am;
  let H = normalize(V + L);
  c += E * pow(sat(dot(n, H)), 30.) * .25;
  c += E * trc * i.pr.y * pow(sat(dot(-V, L)), 4.) * .8;
  return outA(c, alb * am, i.wp, alpha);
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
  // the visible dome is lifted a little over the physical radiance at dawn and golden hour, as a photograph exposed for
  // the sunlit stone would show it; the LUT's own value still drives ambient and aerial perspective
  var c = skyCol(rd, L) * ${[1.6, 1.3, 1][TOD]};
  // high thin cloud: streaks of cirrus on a plane 6 km up, lit gold toward the sun and rose away from it
  if (rd.y > .004) {
    let q = rd.xz / rd.y * 6000.;
    let r = vec2f(q.x * .96 + q.y * .28, q.y * .96 - q.x * .28) * vec2f(.00011, .00042) + vec2f(g.cam.w * .002, 0.);
    let n = fbm(vec3f(r, 1.3), 5) + .35 * (fbm(vec3f(r * 3.1, 4.1), 3) - .5);
    let cov_ = ss(.6, .86, n) * ss(.03, .2, rd.y) * (1. - ss(.35, .9, rd.y));
    let lit = (CLOUDSUN * (.05 + .45 * pow(max(mu, 0.), 4.)) + g.amb.xyz * .9) * (.75 + .5 * fbm(vec3f(r * 7., 2.), 2));
    c = mix(c, lit, cov_ * .45);
  }
  c += mix(SUNC * 9., vec3f(2.4, 2.4, 2.2), NIGHT) * ss(mix(.99988, .99975, NIGHT), mix(.99994, .99982, NIGHT), mu);
  // stars: one soft point per sky cell, a pixel or two wide, so they hold still as the camera moves
  if (NIGHT > .5 && rd.y > 0.) {
    let p = rd * 230.; let h = h33(floor(p)); let off = fract(p) - .5 - (h - .5) * .5;
    c += vec3f(.85, .9, 1.) * step(.982, h.z) * ss(.14, .0, length(off)) * (.4 + 1.6 * h.x * h.x) * ss(.02, .2, rd.y) * 1.6;
  }
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
  let gg = .6;
  let ph = (1. - gg * gg) / pow(1. + gg * gg - 2. * gg * mu, 1.5) * .07 + .1;
  return vec4f(min(SUNC * vec3f(1., .84, .62) * acc * dt * .007 * ph * g.mis.y, vec3f(20.)), zl);
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
const SHARP = .8;
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
  var c = textureLoad(tS, px, 0).rgb;
  if (${LV < 2}) {
    // TAA averages sub-pixel detail away; a clamped unsharp mask brings it back without halos
    let sm = vec2i(textureDimensions(tS)) - 1;
    let n0 = textureLoad(tS, clamp(px + vec2i(1, 0), vec2i(0), sm), 0).rgb; let n1 = textureLoad(tS, clamp(px - vec2i(1, 0), vec2i(0), sm), 0).rgb;
    let n2 = textureLoad(tS, clamp(px + vec2i(0, 1), vec2i(0), sm), 0).rgb; let n3 = textureLoad(tS, clamp(px - vec2i(0, 1), vec2i(0), sm), 0).rgb;
    c = clamp(c + (c - (n0 + n1 + n2 + n3) * .25) * SHARP, min(min(min(n0, n1), min(n2, n3)), c), max(max(max(n0, n1), max(n2, n3)), c));
  }
  c += acc / ws;
  let bl = textureSampleLevel(tB, sC, uv, 0.).rgb;
  c = mix(c, bl, .012) + bl * .005;
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

// ---------------------------------------------------------------- ground-truth ambient occlusion (half res)
// GTAO (Jimenez et al. 2016, structure after XeGTAO): per slice direction, find the highest horizon on each side
// from the depth buffer, then integrate the cosine-weighted visible arc against the projected normal. Positions
// are camera-relative world space, so no view matrix is needed. Noise rotates every frame; TAA averages it.
const W_AO = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var tDp: texture_depth_multisampled_2d;
const SLICES = ${LV ? 2 : 3}; const STEPS = ${LV ? 3 : 4};
fn zAt(p: vec2i) -> f32 { return g.fwd.w / max(textureLoad(tDp, clamp(p, vec2i(0), vec2i(g.res.xy) - 1), 0), 1e-7); }
fn posAt(q: vec2f, z: f32) -> vec3f {
  let uv = q * g.res.zw; let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.) - g.jit.xy;
  return (g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w)) * z;
}
fn fastAcos(x: f32) -> f32 { let a = abs(x); let r = (-.156583 * a + 1.570796) * sqrt(max(1. - a, 0.)); return select(3.141593 - r, r, x >= 0.); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy) * 2; let q = vec2f(p) + .5;
  let dp = textureLoad(tDp, p, 0);
  if (dp < 1e-7) { return vec4f(1., 6e4, 0., 0.); }
  let z = g.fwd.w / dp; let P = posAt(q, z);
  let zr = zAt(p + vec2i(2, 0)); let zl = zAt(p - vec2i(2, 0)); let zd = zAt(p + vec2i(0, 2)); let zu = zAt(p - vec2i(0, 2));
  let dx = select(P - posAt(q - vec2f(2., 0.), zl), posAt(q + vec2f(2., 0.), zr) - P, abs(zr - z) < abs(zl - z));
  let dy = select(P - posAt(q - vec2f(0., 2.), zu), posAt(q + vec2f(0., 2.), zd) - P, abs(zd - z) < abs(zu - z));
  let V = -normalize(P);
  var N = normalize(cross(dx, dy));
  if (dot(N, V) < 0.) { N = -N; }
  // 2.5 m around the point, but never under 8 px, so the far city still gets dark alleys and building feet
  let ppm = g.res.y * .5 / (z * g.up.w);
  let rpx = clamp(2.5 * ppm, 8., 110.); let R = rpx / ppm;
  let fr = R * .62; let fmul = -1. / fr; let fadd = (R - fr) / fr + 1.;
  let nz = fract(ign(fc.xy) + g.jit.w * .618034); let nz2 = fract(ign(fc.xy + 71.) + g.jit.w * .754877);
  var vis = 0.;
  for (var sl = 0; sl < SLICES; sl++) {
    let phi = (f32(sl) + nz) / f32(SLICES) * 3.141593;
    let om = vec2f(cos(phi), -sin(phi));
    let dir = g.right.xyz * om.x - g.up.xyz * om.y;
    let od = dir - dot(dir, V) * V;
    let ax = normalize(cross(od, V));
    let pn = N - ax * dot(N, ax); let pl = length(pn);
    let cn = sat(dot(pn, V) / max(pl, 1e-4));
    let n = sign(dot(od, pn)) * fastAcos(cn);
    let lo0 = cos(n + 1.570796); let lo1 = cos(n - 1.570796);
    var h0 = lo0; var h1 = lo1;
    for (var st = 0; st < STEPS; st++) {
      var t = (f32(st) + nz2) / f32(STEPS); t = t * t;
      let o = om * max(t * rpx, 2. + f32(st));
      let a = vec2i(q + o); let b = vec2i(q - o);
      let da = posAt(vec2f(a) + .5, zAt(a)) - P; let db = posAt(vec2f(b) + .5, zAt(b)) - P;
      let la = max(length(da), 1e-4); let lb = max(length(db), 1e-4);
      h0 = max(h0, mix(lo0, dot(da / la, V), sat(la * fmul + fadd)));
      h1 = max(h1, mix(lo1, dot(db / lb, V), sat(lb * fmul + fadd)));
    }
    let a0 = n + clamp(-fastAcos(h1) - n, -1.570796, 1.570796);
    let a1 = n + clamp(fastAcos(h0) - n, -1.570796, 1.570796);
    vis += pl * ((cn + 2. * a0 * sin(n) - cos(2. * a0 - n)) + (cn + 2. * a1 * sin(n) - cos(2. * a1 - n))) * .25;
  }
  return vec4f(pow(sat(vis / f32(SLICES)), 1.6), z, 0., 0.);
}
`;
// depth-aware 5x5 blur of the half-res AO
const W_AOB = W_FS + /*wgsl*/`
@group(0) @binding(0) var tO: texture_2d<f32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy); let mx = vec2i(textureDimensions(tO)) - 1;
  let c = textureLoad(tO, p, 0);
  var acc = 0.; var ws = 0.;
  for (var y = -2; y <= 2; y++) { for (var x = -2; x <= 2; x++) {
    let r = textureLoad(tO, clamp(p + vec2i(x, y), vec2i(0), mx), 0);
    let w = (1. - .1 * f32(x * x + y * y)) / (.02 + abs(r.y - c.y) / c.y);
    acc += r.x * w; ws += w;
  } }
  return vec4f(acc / ws, c.y, 0., 0.);
}
`;
// ---------------------------------------------------------------- temporal anti-aliasing (full res)
// AO is applied to the ambient share here; then the frame is blended with last frame's result, reprojected by
// depth, with the history clipped to the 3x3 neighbourhood's colour range so moving fronds do not ghost.
const W_TAA = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tA: texture_2d<f32>;
@group(0) @binding(4) var tO: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth_multisampled_2d;
@group(0) @binding(6) var tH: texture_2d<f32>;
fn tm(c: vec3f) -> vec3f { return c / (1. + dot(c, LUMA)); }
fn itm(c: vec3f) -> vec3f { return c / max(1. - dot(c, LUMA), 1e-3); }
fn aoUp(p: vec2i, z: f32) -> f32 {
  let h = (vec2f(p) + .5) * .5 - .5; let b = floor(h); let f = h - b; let bi = vec2i(b);
  let mx = vec2i(textureDimensions(tO)) - 1;
  var acc = 0.; var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1);
    let r = textureLoad(tO, clamp(bi + o, vec2i(0), mx), 0);
    let w = (mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y)) + .01) / (.01 + abs(r.y - z) / z);
    acc += r.x * w; ws += w;
  }
  return acc / ws;
}
// 5-tap Catmull-Rom history fetch: sharper than bilinear, so the image does not soften as frames accumulate
fn hs5(uv: vec2f) -> vec3f {
  let sz = vec2f(textureDimensions(tH)); let p = uv * sz; let tc = floor(p - .5) + .5; let f = p - tc;
  let w0 = f * (-.5 + f * (1. - .5 * f)); let w1 = 1. + f * f * (-2.5 + 1.5 * f); let w2 = f * (.5 + f * (2. - 1.5 * f)); let w3 = f * f * (-.5 + .5 * f);
  let w12 = w1 + w2; let t0 = (tc - 1.) / sz; let t3 = (tc + 2.) / sz; let t12 = (tc + w2 / w12) / sz;
  let a = w12.x * w0.y; let b = w0.x * w12.y; let c = w12.x * w12.y; let d = w3.x * w12.y; let e = w12.x * w3.y;
  let r = textureSampleLevel(tH, sC, vec2f(t12.x, t0.y), 0.).rgb * a + textureSampleLevel(tH, sC, vec2f(t0.x, t12.y), 0.).rgb * b
    + textureSampleLevel(tH, sC, t12, 0.).rgb * c + textureSampleLevel(tH, sC, vec2f(t3.x, t12.y), 0.).rgb * d + textureSampleLevel(tH, sC, vec2f(t12.x, t3.y), 0.).rgb * e;
  return max(r / (a + b + c + d + e), vec3f(0.));
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy); let mx = vec2i(g.res.xy) - 1;
  var m1 = vec3f(0.); var m2 = vec3f(0.); var lo = vec3f(1e9); var hi = vec3f(-1e9); var cur = vec3f(0.);
  var zmin = 1e9; var dpn = 0.; var pn = px;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let q = clamp(px + vec2i(x, y), vec2i(0), mx);
    let dp = textureLoad(tDp, q, 0); let z = g.fwd.w / max(dp, 1e-7);
    let c = tm(textureLoad(tS, q, 0).rgb * (1. - (1. - aoUp(q, z)) * textureLoad(tA, q, 0).r));
    m1 += c; m2 += c * c; lo = min(lo, c); hi = max(hi, c);
    if (x == 0 && y == 0) { cur = c; }
    if (z < zmin) { zmin = z; dpn = dp; pn = q; }
  } }
  // reproject the nearest surface in the neighbourhood, so thin foreground edges do not trail
  let uv = (vec2f(pn) + .5) * g.res.zw; let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.) - g.jit.xy;
  let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
  let pc = select(g.pvp * vec4f(g.cam.xyz + rv * zmin, 1.), g.pvp * vec4f(rv, 0.), dpn < 1e-7);
  let pu = vec2f(pc.x / pc.w * .5 + .5, .5 - pc.y / pc.w * .5) - uv + (vec2f(px) + .5) * g.res.zw;
  let mean = m1 / 9.; let sg = sqrt(max(m2 / 9. - mean * mean, vec3f(0.)));
  let blo = max(lo, mean - sg * 1.25); let bhi = min(hi, mean + sg * 1.25);
  let hist = clamp(tm(hs5(pu)), blo, bhi);
  let off = any(pu < vec2f(0.)) || any(pu > vec2f(1.)) || pc.w <= 0.;
  let a = select(max(g.jit.z, .1), 1., off);
  var o = itm(mix(hist, cur, a));
  if (any(o != o)) { o = itm(cur); }
  return vec4f(min(o, vec3f(60.)), 1.);
}
`;
