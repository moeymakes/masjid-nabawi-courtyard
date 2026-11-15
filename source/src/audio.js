// ============================================================================
// audio: procedural ambience of an evening garden (no sample files, nothing recited)
// ============================================================================
// A fixed Web Audio graph built on the first click / key / touch and driven by a 10 Hz timer, not the frame loop
// (pattern from Abyssal Garden, MIT). Layers: wind bed with slow gusts, palm-frond rustle riding the gusts,
// air rush that follows the camera's speed, a soft drone, dove coos and small-bird chirps.
let AC, OUT, muted = false;
const VOL = 0.7;
function mkSound(ac) {
  const sr = ac.sampleRate;
  const N = (C, o, ...to) => { const n = new C(ac, o); for (const d of to) n.connect(d); if (n.start) n.start(); return n; };
  const G = (gain, ...to) => N(GainNode, { gain }, ...to);
  const BQ = (type, frequency, Q, ...to) => N(BiquadFilterNode, { type, frequency, Q }, ...to);
  const lfo = (frequency, depth, to) => N(OscillatorNode, { frequency }, G(depth, to));
  const noise = (secs, f) => { const n = sr * secs | 0, b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr }); f(b.getChannelData(0), n); f(b.getChannelData(1), n); return b; };
  // seamless brown noise loop and a white one (the ends cross-fade into the starts)
  const loop = (k) => noise(9, (d, n) => { for (let i = 0, b = 0; i < n + 4096; i++) { const w = rnd() * 2 - 1; b = k ? (b + 0.02 * w) / 1.02 : w * .3; const v = b * (k ? 3.5 : 1); if (i < n) d[i] = v; else { const t = (i - n) / 4096; d[i - n] = d[i - n] * t + v * (1 - t); } } });
  const nb = loop(1), nw = loop(0);
  const ir = noise(3, (d, n) => { for (let i = 0, b = 0; i < n; i++) { const t = i / sr; b += (rnd() * 2 - 1 - b) * (0.08 + 0.5 * exp(-t * 3)); d[i] = b * (1 - exp(-t * 40)) * exp(-t * 2.2) * (1 - i / n); } });
  const lim = N(DynamicsCompressorNode, { threshold: -6, knee: 6, ratio: 20, attack: 0.003, release: 0.3 }, ac.destination);
  const out = OUT = G(0, lim), wet = N(ConvolverNode, { buffer: ir }, out);
  const src = (buffer, playbackRate, ...to) => N(AudioBufferSourceNode, { buffer, loop: true, playbackRate }, ...to);
  // wind: low brown noise with two slow gust LFOs
  const wind = G(.28, out);
  src(nb, 1, BQ('lowpass', 420, .6, wind)); lfo(.05, .12, wind.gain); lfo(.083, .08, wind.gain);
  // frond rustle: band-passed white noise that swells with the gusts
  const rus = G(0, out); src(nw, 1, BQ('bandpass', 3200, .7, rus), BQ('highpass', 6000, .5, G(.25, rus)));
  lfo(.05, .05, rus.gain); lfo(.13, .035, rus.gain);
  const rush = G(0, out), rushF = BQ('bandpass', 300, 0.8, rush); src(nb, .7, rushF);
  // drone: a quiet open fifth that slowly beats
  const pad = G(1, out, G(1.2, wet));
  [110, 164.81, 220, 329.63].forEach((f, i) => { const g = G(0.012 - i * 0.002, pad); N(OscillatorNode, { frequency: f }, g); N(OscillatorNode, { frequency: f + rr(0.04, 0.12) }, g); });
  const pool = (n, send, type) => Array.from({ length: n }, () => { const p = N(StereoPannerNode, {}, out, G(send, wet)), g = G(0, p); return { p, g, o: N(OscillatorNode, { type }, g) }; });
  const chirp = pool(4, .25), dove = pool(3, .5);
  const play = (vs, t, f0, f1, dur, vol, att, pan) => {
    const v = vs.shift(), f = v.o.frequency, g = v.g.gain; vs.push(v);
    v.p.pan.setValueAtTime(pan, t);
    f.setValueAtTime(f0, t); f.exponentialRampToValueAtTime(f1, t + dur);
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(vol, t + att); g.setTargetAtTime(0, t + att, (dur - att) / 4);
  };
  let lt = ac.currentTime, tB = lt + 2, tD = lt + 6, lx = F[CX], ly = F[CY], lz = F[CZ];
  out.gain.setTargetAtTime(VOL, lt, 1);
  return () => {
    const now = ac.currentTime, t = now + 0.05, dt = now - lt;
    if (dt <= 0) return;
    let v = hypot(F[CX] - lx, F[CY] - ly, F[CZ] - lz) / dt; if (v > 80) v = 0;
    lt = now; lx = F[CX]; ly = F[CY]; lz = F[CZ];
    rush.gain.setTargetAtTime(0.35 * pow(min(v / 40, 1), 1.2), t, 0.3); rushF.frequency.setTargetAtTime(240 + v * 12, t, 0.3);
    const inGrove = max(abs(F[CX]), abs(F[CZ])) < 250 && F[CY] < 40;
    rus.gain.setTargetAtTime(inGrove ? .09 : .02, t, 1.5);
    if (t > tB) { // a small bird: a burst of quick high chirps
      let tt = t; const pan = rr(-.8, .8), f = rr(2600, 4200);
      for (let n = 2 + rnd() * 5 | 0; n--;) { play(chirp, tt, f * rr(.9, 1.1), f * rr(1.2, 1.5), .07, rr(.015, .03) * (inGrove ? 1 : .3), .005, pan); tt += rr(.08, .16); }
      tB = tt + rr(1.5, 7);
    }
    if (t > tD) { // a dove: coo, long rising-falling COO, coo
      let tt = t; const pan = rr(-.7, .7), f = rr(300, 360);
      for (const [a, b, d] of [[1, .96, .25], [.92, 1.08, .55], [1.02, .9, .3]]) { play(dove, tt, f * a, f * b, d, .03, d * .3, pan); tt += d + .12; }
      tD = tt + rr(6, 16);
    }
  };
}
function sound() {
  if (!AC) { AC = new AudioContext({ latencyHint: 'playback' }); setInterval(mkSound(AC), 100); }
  if (AC.state === 'suspended' && !document.hidden) AC.resume();
}
const mute = () => { muted = !muted; OUT.gain.setTargetAtTime(muted ? 0 : VOL, AC.currentTime, 0.08); };
document.addEventListener('visibilitychange', () => { if (AC) document.hidden ? AC.suspend() : AC.resume(); });
