// Audio: decode any clip the browser can play, cut, change speed, volume, fades, then encode Opus into Ogg.
// Browser only (WebAudio + WebCodecs AudioEncoder).

(function (root) {
  "use strict";
  const WASI = (root.WASI = root.WASI || {});
  const RATE = 48000;
  const MAX_AUDIO_BYTES = 1000000;

  async function decode(arrayBuffer) {
    const ctx = new OfflineAudioContext(1, 1, RATE);
    try {
      return await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch (_) {
      throw new Error("audio.cannotRead");
    }
  }

  // Returns a Float32Array of mono PCM at 48 kHz for the chosen part of the clip.
  async function render(buffer, { start = 0, end, speed = 1, volume = 1, fadeIn = 0, fadeOut = 0, normalize = false, reverse = false } = {}) {
    end = Math.min(end || buffer.duration, buffer.duration);
    const part = Math.max(0.05, end - start);
    const outSeconds = part / speed;
    const ctx = new OfflineAudioContext(1, Math.ceil(outSeconds * RATE), RATE);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = speed;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(ctx.destination);
    src.start(0, start, part);
    const out = await ctx.startRendering();
    const pcm = out.getChannelData(0).slice();
    if (reverse) pcm.reverse();
    if (normalize) normalizePeak(pcm, 0.95);
    applyFades(pcm, Math.max(0.008, fadeIn), Math.max(0.008, fadeOut));
    softClip(pcm);
    return pcm;
  }

  function normalizePeak(pcm, target) {
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    if (peak < 0.001) return;
    const g = Math.min(8, target / peak);
    for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
  }

  // Gentle curve above 0.9 so a volume boost never wraps or crackles.
  function softClip(pcm) {
    for (let i = 0; i < pcm.length; i++) {
      const x = pcm[i];
      const a = Math.abs(x);
      if (a > 0.9) pcm[i] = Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
    }
  }

  function applyFades(pcm, fadeIn, fadeOut) {
    const fi = Math.min(pcm.length, Math.round(fadeIn * RATE));
    const fo = Math.min(pcm.length, Math.round(fadeOut * RATE));
    for (let i = 0; i < fi; i++) pcm[i] *= i / fi;
    for (let i = 0; i < fo; i++) pcm[pcm.length - 1 - i] *= i / fo;
  }

  // Bitrate that keeps the file under 1 MB: 32 kbps for short clips, lower for long ones, never under 12.
  function pickBitrate(seconds) {
    const fit = Math.floor((0.9 * MAX_AUDIO_BYTES * 8) / Math.max(1, seconds));
    return Math.max(12000, Math.min(32000, fit));
  }

  async function encodeOpus(pcm, bitrate) {
    if (typeof AudioEncoder === "undefined") throw new Error("audio.noEncoder");
    const base = { codec: "opus", sampleRate: RATE, numberOfChannels: 1, bitrate };
    const tries = [
      { ...base, bitrateMode: "variable", opus: { frameDuration: 20000, complexity: 10, application: "audio" } },
      { ...base, opus: { frameDuration: 20000 } },
      base,
    ];
    let config = null;
    for (const c of tries) {
      try {
        if ((await AudioEncoder.isConfigSupported(c)).supported) {
          config = c;
          break;
        }
      } catch (_) {
        /* try the next one */
      }
    }
    if (!config) throw new Error("audio.noEncoder");

    const packets = [];
    let description = null;
    let failure = null;
    const encoder = new AudioEncoder({
      output: (chunk, meta) => {
        const b = new Uint8Array(chunk.byteLength);
        chunk.copyTo(b);
        packets.push(b);
        if (meta && meta.decoderConfig && meta.decoderConfig.description) description = meta.decoderConfig.description;
      },
      error: (e) => (failure = e),
    });
    encoder.configure(config);
    const block = 960 * 50;
    for (let i = 0; i < pcm.length; i += block) {
      const part = pcm.subarray(i, Math.min(pcm.length, i + block));
      const data = new AudioData({
        format: "f32-planar",
        sampleRate: RATE,
        numberOfFrames: part.length,
        numberOfChannels: 1,
        timestamp: Math.round((i / RATE) * 1e6),
        data: part,
      });
      encoder.encode(data);
      data.close();
    }
    await encoder.flush();
    encoder.close();
    if (failure) throw new Error("audio.encodeFailed");
    const preSkip = WASI.ogg.preSkipFrom(description);
    return WASI.ogg.writeOgg(packets, { preSkip, totalSamples: pcm.length });
  }

  // Full step: PCM to an Ogg that fits 1 MB, lowering the bitrate if the first try is too big.
  async function makeOgg(pcm) {
    const seconds = pcm.length / RATE;
    let bitrate = pickBitrate(seconds);
    for (let attempt = 0; attempt < 3; attempt++) {
      const ogg = await encodeOpus(pcm, bitrate);
      if (ogg.length <= MAX_AUDIO_BYTES) return { ogg, seconds, bitrate };
      bitrate = Math.max(12000, Math.floor(bitrate * 0.75));
    }
    throw new Error("audio.tooLong");
  }

  // Loudness envelope used for the waveform view and the "voice sticker" animation.
  function peaks(pcmOrBuffer, count) {
    const data = pcmOrBuffer.getChannelData ? pcmOrBuffer.getChannelData(0) : pcmOrBuffer;
    const out = new Float32Array(count);
    const step = Math.max(1, Math.floor(data.length / count));
    for (let i = 0; i < count; i++) {
      let m = 0;
      const s = i * step;
      for (let j = s; j < Math.min(data.length, s + step); j += 4) m = Math.max(m, Math.abs(data[j]));
      out[i] = m;
    }
    return out;
  }

  WASI.audio = { decode, render, makeOgg, encodeOpus, pickBitrate, peaks, RATE, MAX_AUDIO_BYTES };
})(typeof globalThis !== "undefined" ? globalThis : this);
