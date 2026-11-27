// Builder: clip + edit settings in, { webp, ogg, meta } out, both under WhatsApp's 1 MB limits.
// Browser only. Every long step checks the AbortSignal so Cancel stops quickly.

(function (root) {
  "use strict";
  const WASI = (root.WASI = root.WASI || {});
  const MAX_STICKER_BYTES = 1000000;
  const SWEET_BYTES = 480000; // budget-friendly sweet spot (fast send, crisp on phones)
  const TARGET_BYTES = 920000; // room for EXIF and frame headers
  const SIDES = [512, 448, 384, 320, 256, 192];
  const QUALITIES = [0.76, 0.66, 0.56, 0.45, 0.35];
  const LOWEST_QUALITY = 0.22;

  function fpsFor(seconds) {
    if (seconds <= 4) return 16;
    if (seconds <= 8) return 14;
    return 12;
  }

  async function encodeFrame(bitmap, side, quality) {
    const c = new OffscreenCanvas(side, side);
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(bitmap, 0, 0, side, side);
    const blob = await c.convertToBlob({ type: "image/webp", quality });
    if (blob.type !== "image/webp") throw new Error("build.noWebp");
    return new Uint8Array(await blob.arrayBuffer());
  }

  // Keeps every nth frame and gives it the time of the frames it replaces.
  function thin(frames, every) {
    if (every <= 1) return frames;
    const out = [];
    for (let i = 0; i < frames.length; i += every) {
      const group = frames.slice(i, i + every);
      out.push({ bitmap: group[0].bitmap, duration: group.reduce((n, f) => n + f.duration, 0) });
    }
    return out;
  }

  // Encodes a few frames to guess the full size for each side and quality, then picks the best that fits.
  async function choose(frames, signal) {
    const sampleIdx = [];
    const want = Math.min(frames.length, 8);
    for (let i = 0; i < want; i++) sampleIdx.push(Math.floor((i * frames.length) / want));
    const avgCache = new Map();
    async function avg(side, q) {
      const key = side + ":" + q;
      if (!avgCache.has(key)) {
        let total = 0;
        for (const i of sampleIdx) {
          if (signal && signal.aborted) throw new DOMException("Cancelled", "AbortError");
          total += (await encodeFrame(frames[i].bitmap, side, q)).length;
        }
        avgCache.set(key, total / sampleIdx.length);
      }
      return avgCache.get(key);
    }
    // First try the budget-friendly 480 KB sweet spot at crisp sizes (512..384) and high quality (0.76..0.56)
    for (const side of [512, 448, 384]) {
      for (const every of [1, 2]) {
        const count = Math.ceil(frames.length / every);
        for (const q of [0.76, 0.66, 0.56]) {
          const est = (await avg(side, q)) * count + count * 32 + 2048;
          if (est <= SWEET_BYTES) return { side, every, quality: q };
        }
      }
    }
    for (const side of SIDES) {
      for (const every of [1, 2, 3]) {
        const count = Math.ceil(frames.length / every);
        for (const q of QUALITIES) {
          const est = (await avg(side, q)) * count + count * 32 + 2048;
          if (est <= TARGET_BYTES) return { side, every, quality: q };
        }
      }
    }
    return { side: 192, every: 3, quality: LOWEST_QUALITY };
  }

  async function encodeAll(frames, side, quality, signal, onProgress) {
    const out = [];
    for (let i = 0; i < frames.length; i++) {
      if (signal && signal.aborted) throw new DOMException("Cancelled", "AbortError");
      out.push({ webp: await encodeFrame(frames[i].bitmap, side, quality), duration: frames[i].duration });
      onProgress && onProgress(i / frames.length);
    }
    return out;
  }

  function b64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  async function sha256(bytes) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  }

  // Stable pack id from pack name and author, so stickers from the same pack group together.
  async function packId(name, author) {
    if (!name && !author) return crypto.randomUUID();
    const h = await sha256(new TextEncoder().encode("wasi:" + name + "|" + author));
    const x = [...h.subarray(0, 16)].map((v) => v.toString(16).padStart(2, "0")).join("");
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
  }

  // Turns frames + Ogg into the final WebP that fits, lowering quality, then fps, then size if needed.
  async function packWebp(frames, ogg, { pack = "whatsapp-audio-stickers-india", author = "whatsapp-audio-stickers-india", emoji = "🔊" } = {}, signal, onProgress) {
    frames = await WASI.frames.dedupe(frames);
    const meta = {
      "sticker-pack-id": await packId(pack, author),
      "sticker-pack-name": String(pack).trim().slice(0, 128),
      "sticker-pack-publisher": String(author).trim().slice(0, 128),
      emojis: [emoji || "🔊"],
      "sound-sha256": b64(await sha256(ogg)),
    };
    const exif = WASI.webp.stickerExif(meta);
    let pick = await choose(frames, signal);
    for (let attempt = 0; attempt < 6; attempt++) {
      const use = thin(frames, pick.every);
      const encoded = await encodeAll(use, pick.side, pick.quality, signal, onProgress);
      const file = WASI.webp.buildAnimated(encoded, { side: pick.side, exif });
      if (file.length <= MAX_STICKER_BYTES) return { webp: file, meta, side: pick.side, frames: use.length, quality: pick.quality };
      // Too big after all: step down quality first, then size.
      const qi = QUALITIES.indexOf(pick.quality);
      if (qi >= 0 && qi < QUALITIES.length - 1) pick = { ...pick, quality: QUALITIES[qi + 1] };
      else if (pick.side > 192) pick = { ...pick, side: SIDES[SIDES.indexOf(pick.side) + 1], quality: QUALITIES[2] };
      else if (pick.every < 4) pick = { ...pick, every: pick.every + 1 };
      else break;
    }
    throw new Error("build.tooBig");
  }

  WASI.builder = { packWebp, fpsFor, b64, sha256, MAX_STICKER_BYTES };
})(typeof globalThis !== "undefined" ? globalThis : this);
