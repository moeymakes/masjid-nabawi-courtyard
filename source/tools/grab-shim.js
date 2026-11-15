// Injected by capture.mjs before any page script runs (page.addInitScript). Works on ANY WebGPU page, including
// ones you did not write, because it patches the WebGPU prototypes rather than the app.
//
// Why it exists (measured on moeys-tower-omarchy, RTX 3070, Chrome 157, 2026-11-15):
//   1. Headless Chrome only gets the real GPU with --use-angle=vulkan --disable-vulkan-surface; without
//      --disable-vulkan-surface every adapter is SwiftShader (isFallbackAdapter = true) and big scenes die with
//      "A valid external Instance reference no longer exists".
//   2. In that mode requestAdapter({powerPreference:'high-performance'}) returns null while requestAdapter()
//      returns the NVIDIA adapter, so the request is retried without options.
//   3. The page renders at full speed, but page.screenshot() of a WebGPU canvas comes out pure WHITE (no
//      compositor interop). So frames are copied out of the swap-chain texture with copyTextureToBuffer.
//
// API: window.__grab() -> Promise<string> PNG data URL of the next frame the page submits to the canvas.
//      window.__gpuInfo  -> adapter description string once the page has requested an adapter.
(() => {
  const g = navigator.gpu; if (!g) return;
  const ra = g.requestAdapter.bind(g);
  g.requestAdapter = async (o) => {
    const a = (await ra(o)) || (await ra());
    if (a) window.__gpuInfo = `${a.info?.vendor} ${a.info?.architecture} ${a.info?.description || ''} fallback=${!!a.info?.isFallbackAdapter}`;
    return a;
  };
  let dev = null, tex = null, want = null;
  const rd = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (d) { const x = await rd.call(this, d); dev = x; return x; };
  // the canvas texture must allow COPY_SRC to be read back
  const cf = GPUCanvasContext.prototype.configure;
  GPUCanvasContext.prototype.configure = function (c) {
    return cf.call(this, { ...c, usage: (c.usage ?? GPUTextureUsage.RENDER_ATTACHMENT) | GPUTextureUsage.COPY_SRC });
  };
  const gct = GPUCanvasContext.prototype.getCurrentTexture;
  GPUCanvasContext.prototype.getCurrentTexture = function () { const t = gct.call(this); tex = t; return t; };
  // after the page's own submit for a frame, copy that frame's canvas texture out (same task: still valid)
  const sub = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (cmds) {
    sub.call(this, cmds);
    if (!want || !tex || !dev || this !== dev.queue) return;
    const done = want; want = null;
    const t = tex, w = t.width, h = t.height, bpr = Math.ceil(w * 4 / 256) * 256, bgra = t.format.startsWith('bgra');
    const b = dev.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const e = dev.createCommandEncoder();
    e.copyTextureToBuffer({ texture: t }, { buffer: b, bytesPerRow: bpr }, [w, h]);
    sub.call(this, [e.finish()]);
    b.mapAsync(GPUMapMode.READ).then(async () => {
      const src = new Uint8Array(b.getMappedRange()), px = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * bpr + x * 4, o = (y * w + x) * 4;
        px[o] = src[i + (bgra ? 2 : 0)]; px[o + 1] = src[i + 1]; px[o + 2] = src[i + (bgra ? 0 : 2)]; px[o + 3] = 255;
      }
      b.unmap(); b.destroy();
      const oc = new OffscreenCanvas(w, h); oc.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0);
      const blob = await oc.convertToBlob({ type: 'image/png' });
      const fr = new FileReader(); fr.onload = () => done({ url: fr.result, w, h }); fr.readAsDataURL(blob);
    });
  };
  window.__grab = () => new Promise((r) => { want = r; });
})();
