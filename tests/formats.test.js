const test = require("node:test");
const assert = require("node:assert/strict");
const ogg = require("../extension/lib/ogg.js");
const webp = require("../extension/lib/webp.js");

test("Ogg CRC matches CRC-32/CKSUM without the final xor", () => {
  const crc = ogg.crc32(new TextEncoder().encode("123456789"));
  assert.equal(crc, (~0x765e7680) >>> 0);
});

test("lacing splits packets at 255", () => {
  assert.deepEqual(ogg.lacing(10), [10]);
  assert.deepEqual(ogg.lacing(255), [255, 0]);
  assert.deepEqual(ogg.lacing(600), [255, 255, 90]);
});

test("Ogg file has head, tags and audio pages with valid CRCs", () => {
  const packets = Array.from({ length: 120 }, (_, i) => new Uint8Array(40 + (i % 7)).fill(i));
  const file = ogg.writeOgg(packets, { preSkip: 312, totalSamples: 120 * 960 - 100, serial: 7 });
  const pages = [];
  let pos = 0;
  while (pos < file.length) {
    assert.equal(String.fromCharCode(...file.subarray(pos, pos + 4)), "OggS");
    const n = file[pos + 26];
    const body = file.subarray(pos + 27, pos + 27 + n).reduce((a, b) => a + b, 0);
    const len = 27 + n + body;
    const copy = file.slice(pos, pos + len);
    const dv = new DataView(copy.buffer);
    const crc = dv.getUint32(22, true);
    dv.setUint32(22, 0, true);
    assert.equal(ogg.crc32(copy), crc, "page CRC");
    pages.push({ type: copy[5], granule: Number(dv.getBigUint64(6, true)), seq: dv.getUint32(18, true) });
    pos += len;
  }
  assert.equal(pages.length, 2 + 3);
  assert.equal(pages[0].type, 2);
  assert.equal(pages.at(-1).type, 4);
  assert.equal(pages.at(-1).granule, 312 + 120 * 960 - 100);
  assert.deepEqual(pages.map((p) => p.seq), [0, 1, 2, 3, 4]);
  assert.equal(String.fromCharCode(...file.subarray(28, 36)), "OpusHead");
});

test("pre-skip is read from an OpusHead description", () => {
  const d = new Uint8Array(19);
  d.set(new TextEncoder().encode("OpusHead"));
  d[10] = 0x38;
  d[11] = 0x01;
  assert.equal(ogg.preSkipFrom(d), 312);
  d[10] = 0x00;
  assert.equal(ogg.preSkipFrom(d), 256);
  assert.equal(ogg.preSkipFrom(null), 312);
});

function fakeFrame(withAlpha) {
  // A tiny single-frame WebP: RIFF + optional ALPH + VP8 chunk with dummy bytes.
  const parts = [new TextEncoder().encode("WEBP")];
  if (withAlpha) parts.push(webp.chunk("ALPH", new Uint8Array([1, 2, 3])));
  parts.push(webp.chunk("VP8 ", new Uint8Array([9, 9, 9, 9])));
  const inner = Buffer.concat(parts.map((p) => Buffer.from(p)));
  const head = Buffer.alloc(8);
  head.write("RIFF");
  head.writeUInt32LE(inner.length, 4);
  return new Uint8Array(Buffer.concat([head, inner]));
}

test("animated WebP has VP8X, ANIM, frames and EXIF, and reads back", () => {
  const meta = { "sticker-pack-id": "x", emojis: ["🔊"], "sound-sha256": "abc=" };
  const file = webp.buildAnimated(
    [
      { webp: fakeFrame(true), duration: 100 },
      { webp: fakeFrame(false), duration: 3 },
    ],
    { side: 512, exif: webp.stickerExif(meta) }
  );
  const dv = new DataView(file.buffer);
  assert.equal(String.fromCharCode(...file.subarray(0, 4)), "RIFF");
  assert.equal(dv.getUint32(4, true), file.length - 8);
  const info = webp.inspect(file);
  assert.equal(info.side, 512);
  assert.equal(info.frames, 2);
  assert.equal(info.duration, 108, "frames shorter than 8 ms are raised to 8 ms");
  assert.equal(info.flags, 0x02 | 0x08 | 0x10);
  assert.deepEqual(info.meta, meta);
});

test("EXIF block is a big-endian TIFF with the WA tag", () => {
  const e = webp.stickerExif({ a: 1 });
  assert.deepEqual([...e.subarray(0, 4)], [0x4d, 0x4d, 0x00, 0x2a]);
  const dv = new DataView(e.buffer);
  assert.equal(dv.getUint16(10, false), 0x5741);
  assert.equal(dv.getUint32(18, false), 26);
});

test("non-WebP input is refused", () => {
  assert.throws(() => webp.imageChunks(new Uint8Array(30)), /Not a WebP/);
});
