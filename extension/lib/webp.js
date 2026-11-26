// Animated WebP writer (Google WebP container spec) with the WhatsApp sticker EXIF block.
// Frames come from the browser's own WebP encoder (canvas.convertToBlob); we keep only their image chunks
// (ALPH, VP8, VP8L) and put them into ANMF frames.

(function (root) {
  "use strict";

  const enc = new TextEncoder();
  const fourcc = (s) => enc.encode(s);

  function readFourcc(b, at) {
    return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  }

  // A chunk with header and even padding.
  function chunk(id, payload) {
    const pad = payload.length & 1;
    const out = new Uint8Array(8 + payload.length + pad);
    out.set(fourcc(id), 0);
    new DataView(out.buffer).setUint32(4, payload.length, true);
    out.set(payload, 8);
    return out;
  }

  function concat(parts) {
    const size = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(size);
    let pos = 0;
    for (const p of parts) {
      out.set(p, pos);
      pos += p.length;
    }
    return out;
  }

  function u24(dv, at, v) {
    dv.setUint8(at, v & 0xff);
    dv.setUint8(at + 1, (v >> 8) & 0xff);
    dv.setUint8(at + 2, (v >> 16) & 0xff);
  }

  // Pull the image chunks out of a single-frame WebP file. Returns { chunks: Uint8Array (raw chunks), hasAlpha }.
  function imageChunks(file) {
    const b = file instanceof Uint8Array ? file : new Uint8Array(file);
    if (b.length < 20 || readFourcc(b, 0) !== "RIFF" || readFourcc(b, 8) !== "WEBP") throw new Error("Not a WebP file.");
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const keep = [];
    let hasAlpha = false;
    let pos = 12;
    while (pos + 8 <= b.length) {
      const id = readFourcc(b, pos);
      const len = dv.getUint32(pos + 4, true);
      const end = pos + 8 + len + (len & 1);
      if (end > b.length + 1) throw new Error("Broken WebP chunk.");
      if (id === "ALPH" || id === "VP8 " || id === "VP8L") {
        keep.push(b.subarray(pos, Math.min(end, b.length)));
        if (id === "ALPH" || id === "VP8L") hasAlpha = true;
      }
      pos = end;
    }
    if (!keep.length) throw new Error("WebP frame has no image data.");
    return { chunks: concat(keep), hasAlpha };
  }

  // Minimal big-endian TIFF with one "WA" (0x5741) entry holding UTF-8 JSON.
  function stickerExif(meta) {
    const json = enc.encode(JSON.stringify(meta));
    const out = new Uint8Array(26 + json.length);
    const dv = new DataView(out.buffer);
    out.set([0x4d, 0x4d, 0x00, 0x2a], 0);
    dv.setUint32(4, 8, false);
    dv.setUint16(8, 1, false);
    dv.setUint16(10, 0x5741, false);
    dv.setUint16(12, 7, false);
    dv.setUint32(14, json.length, false);
    dv.setUint32(18, 26, false);
    dv.setUint32(22, 0, false);
    out.set(json, 26);
    return out;
  }

  // frames: [{ webp: Uint8Array (single-frame file), duration: ms }]; side: canvas size in px.
  function buildAnimated(frames, { side, exif } = {}) {
    if (!frames.length) throw new Error("No frames to write.");
    if (!(side >= 1 && side <= 16384)) throw new Error("Bad sticker size.");
    let alpha = false;
    const anmf = frames.map((f) => {
      const { chunks, hasAlpha } = imageChunks(f.webp);
      alpha = alpha || hasAlpha;
      const head = new Uint8Array(16);
      const dv = new DataView(head.buffer);
      u24(dv, 0, 0); // x / 2
      u24(dv, 3, 0); // y / 2
      u24(dv, 6, side - 1);
      u24(dv, 9, side - 1);
      u24(dv, 12, Math.max(8, Math.min(0xffffff, Math.round(f.duration))));
      head[15] = 0x02; // do not blend, do not dispose
      return chunk("ANMF", concat([head, chunks]));
    });

    const vp8x = new Uint8Array(10);
    const vdv = new DataView(vp8x.buffer);
    vp8x[0] = 0x02 | (exif ? 0x08 : 0) | (alpha ? 0x10 : 0);
    u24(vdv, 4, side - 1);
    u24(vdv, 7, side - 1);

    const anim = new Uint8Array(6); // background 0 (transparent), loop count 0 (forever)

    const body = [fourcc("WEBP"), chunk("VP8X", vp8x), chunk("ANIM", anim), ...anmf];
    if (exif) body.push(chunk("EXIF", exif));
    const inner = concat(body);
    const head = new Uint8Array(8);
    head.set(fourcc("RIFF"), 0);
    new DataView(head.buffer).setUint32(4, inner.length, true);
    return concat([head, inner]);
  }

  // Read back what we wrote (used by tests and by the library to show info).
  function inspect(file) {
    const b = file instanceof Uint8Array ? file : new Uint8Array(file);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const info = { frames: 0, duration: 0, flags: 0, side: 0, meta: null };
    let pos = 12;
    while (pos + 8 <= b.length) {
      const id = readFourcc(b, pos);
      const len = dv.getUint32(pos + 4, true);
      const p = pos + 8;
      if (id === "VP8X") {
        info.flags = b[p];
        info.side = 1 + (b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16));
      } else if (id === "ANMF") {
        info.frames++;
        info.duration += b[p + 12] | (b[p + 13] << 8) | (b[p + 14] << 16);
      } else if (id === "EXIF") {
        const n = new DataView(b.buffer, b.byteOffset + p, len).getUint32(14, false);
        info.meta = JSON.parse(new TextDecoder().decode(b.subarray(p + 26, p + 26 + n)));
      }
      pos = p + len + (len & 1);
    }
    return info;
  }

  const api = { buildAnimated, stickerExif, imageChunks, inspect, chunk };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.WASI = root.WASI || {}).webp = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
