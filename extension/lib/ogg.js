// Ogg Opus writer (RFC 3533 pages, RFC 7845 Opus mapping), mono only.
// Input: Opus packets of 20 ms each (960 samples at 48 kHz). Output: Uint8Array of a complete .ogg file.

(function (root) {
  "use strict";

  const SAMPLES_PER_PACKET = 960;
  const PACKETS_PER_PAGE = 50; // about one second per page

  // CRC-32 used by Ogg: polynomial 0x04C11DB7, initial 0, not reflected.
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let r = i << 24;
      for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
      t[i] = r >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let crc = 0;
    for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
    return crc >>> 0;
  }

  function lacing(len) {
    const out = [];
    while (len >= 255) {
      out.push(255);
      len -= 255;
    }
    out.push(len); // a packet that is an exact multiple of 255 ends with a 0
    return out;
  }

  function page({ headerType, granule, serial, sequence, packets }) {
    const segments = [];
    for (const p of packets) segments.push(...lacing(p.length));
    if (segments.length > 255) throw new Error("Too many segments on one Ogg page.");
    const bodyLen = packets.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(27 + segments.length + bodyLen);
    const dv = new DataView(out.buffer);
    out.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
    out[4] = 0; // version
    out[5] = headerType;
    dv.setBigUint64(6, BigInt(granule), true);
    dv.setUint32(14, serial >>> 0, true);
    dv.setUint32(18, sequence >>> 0, true);
    dv.setUint32(22, 0, true); // CRC, filled below
    out[26] = segments.length;
    out.set(segments, 27);
    let pos = 27 + segments.length;
    for (const p of packets) {
      out.set(p, pos);
      pos += p.length;
    }
    dv.setUint32(22, crc32(out), true);
    return out;
  }

  function opusHead(preSkip) {
    const b = new Uint8Array(19);
    const dv = new DataView(b.buffer);
    b.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
    b[8] = 1; // version
    b[9] = 1; // mono
    dv.setUint16(10, preSkip, true);
    dv.setUint32(12, 48000, true);
    dv.setInt16(16, 0, true); // output gain
    b[18] = 0; // mapping family
    return b;
  }

  function opusTags(vendor) {
    const v = new TextEncoder().encode(vendor);
    const b = new Uint8Array(8 + 4 + v.length + 4);
    const dv = new DataView(b.buffer);
    b.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // "OpusTags"
    dv.setUint32(8, v.length, true);
    b.set(v, 12);
    dv.setUint32(12 + v.length, 0, true); // no user comments
    return b;
  }

  // Pre-skip from the encoder's decoder description when it is an OpusHead, else the usual 312.
  function preSkipFrom(description) {
    try {
      if (description) {
        const d = description instanceof ArrayBuffer ? new Uint8Array(description) : new Uint8Array(description.buffer || description);
        if (d.length >= 12 && String.fromCharCode(...d.slice(0, 8)) === "OpusHead") return d[10] | (d[11] << 8);
      }
    } catch (_) {
      /* fall through */
    }
    return 312;
  }

  // packets: Uint8Array[]; totalSamples: real PCM length at 48 kHz.
  function writeOgg(packets, { preSkip = 312, totalSamples, serial, vendor = "whatsapp-audio-stickers-india" } = {}) {
    if (!packets.length) throw new Error("No audio to write.");
    serial = serial === undefined ? (Math.random() * 0xffffffff) >>> 0 : serial;
    const total = totalSamples === undefined ? packets.length * SAMPLES_PER_PACKET : totalSamples;
    const pages = [];
    let seq = 0;
    pages.push(page({ headerType: 0x02, granule: 0, serial, sequence: seq++, packets: [opusHead(preSkip)] }));
    pages.push(page({ headerType: 0x00, granule: 0, serial, sequence: seq++, packets: [opusTags(vendor)] }));
    for (let i = 0; i < packets.length; i += PACKETS_PER_PAGE) {
      const chunk = packets.slice(i, i + PACKETS_PER_PAGE);
      const last = i + PACKETS_PER_PAGE >= packets.length;
      const done = (i + chunk.length) * SAMPLES_PER_PACKET;
      const granule = preSkip + (last ? total : Math.min(done, total));
      pages.push(page({ headerType: last ? 0x04 : 0x00, granule, serial, sequence: seq++, packets: chunk }));
    }
    const size = pages.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(size);
    let pos = 0;
    for (const p of pages) {
      out.set(p, pos);
      pos += p.length;
    }
    return out;
  }

  const api = { writeOgg, crc32, lacing, preSkipFrom, SAMPLES_PER_PACKET };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.WASI = root.WASI || {}).ogg = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
