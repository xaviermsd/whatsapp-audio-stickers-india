// Frames: turn a video, GIF, photo or plain audio into square sticker frames (ImageBitmaps at 512 px),
// with fit or crop, caption text and the "voice sticker" sound-wave animation. Browser only.

(function (root) {
  "use strict";
  const WASI = (root.WASI = root.WASI || {});
  const SIDE = 512;
  const FONT_STACK = '"Baloo 2", "Nirmala UI", "Noto Sans Devanagari", "Mangal", "Segoe UI", system-ui, sans-serif';

  function kindOf(file) {
    const t = (file.type || "").toLowerCase();
    const n = (file.name || "").toLowerCase();
    if (t.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v|3gp)$/.test(n)) return "video";
    if (t === "image/gif" || /\.gif$/.test(n)) return "animated";
    if (t.startsWith("image/") || /\.(png|jpe?g|webp|avif|bmp)$/.test(n)) return "image";
    if (t.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|opus|wav|flac|amr)$/.test(n)) return "audio";
    return "unknown";
  }

  function waitEvent(el, ok, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => done(reject, new Error("frames.timeout")), ms);
      const onOk = () => done(resolve);
      const onErr = () => done(reject, new Error("frames.cannotRead"));
      function done(fn, v) {
        clearTimeout(timer);
        el.removeEventListener(ok, onOk);
        el.removeEventListener("error", onErr);
        fn(v);
      }
      el.addEventListener(ok, onOk);
      el.addEventListener("error", onErr);
    });
  }

  // Opens a video and fixes the "Infinity" duration that recorded WebM files report.
  async function openVideo(url) {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.src = url;
    // Chrome only paints frames for videos that are in the page, so keep it in, nearly invisible.
    v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;";
    (document.body || document.documentElement).appendChild(v);
    await waitEvent(v, "loadedmetadata", 30000);
    if (!Number.isFinite(v.duration)) {
      v.currentTime = 1e7;
      await waitEvent(v, "seeked", 8000).catch(() => {});
      v.currentTime = 0;
      await waitEvent(v, "seeked", 8000).catch(() => {});
    }
    return v;
  }

  async function seek(v, t) {
    if (Math.abs(v.currentTime - t) < 0.001 && v.readyState >= 2) return;
    v.currentTime = t;
    await waitEvent(v, "seeked", 8000);
  }

  // Draws one source picture into the square, with fit or crop and the caption.
  function compose(ctx, img, iw, ih, edit, extra) {
    const side = ctx.canvas.width;
    ctx.clearRect(0, 0, side, side);
    if (extra && extra.background) extra.background(ctx, side);
    if (img && iw && ih) {
      const scale = edit.fit === "contain" ? Math.min(side / iw, side / ih) : Math.max(side / iw, side / ih);
      const w = iw * scale;
      const h = ih * scale;
      ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
    }
    if (extra && extra.overlay) extra.overlay(ctx, side);
    if (edit.text) drawCaption(ctx, edit.text, side, edit.textPos);
  }

  function wrap(ctx, text, max) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > max && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines.slice(0, 2);
  }

  function drawCaption(ctx, text, side, pos) {
    let size = Math.round(side * 0.12);
    ctx.font = `800 ${size}px ${FONT_STACK}`;
    let lines = wrap(ctx, text, side * 0.9);
    while (lines.some((l) => ctx.measureText(l).width > side * 0.94) && size > 20) {
      size -= 4;
      ctx.font = `800 ${size}px ${FONT_STACK}`;
      lines = wrap(ctx, text, side * 0.9);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(4, size * 0.16);
    const lh = size * 1.15;
    const block = lh * lines.length;
    const top = pos === "top" ? side * 0.06 + lh / 2 : side * 0.94 - block + lh / 2;
    lines.forEach((l, i) => {
      const y = top + i * lh;
      ctx.strokeStyle = "#000";
      ctx.strokeText(l, side / 2, y);
      ctx.fillStyle = "#fff";
      ctx.fillText(l, side / 2, y);
    });
  }

  function newCanvas() {
    const c = new OffscreenCanvas(SIDE, SIDE);
    return { c, ctx: c.getContext("2d") };
  }

  function check(signal) {
    if (signal && signal.aborted) throw new DOMException("Cancelled", "AbortError");
  }

  // Video frames for [start, end] at fps, sped up or slowed down by speed. Returns [{ bitmap, duration }].
  async function fromVideo(video, edit, { fps, signal, onProgress }) {
    const { c, ctx } = newCanvas();
    const part = edit.end - edit.start;
    const outSeconds = part / edit.speed;
    const n = Math.max(1, Math.round(outSeconds * fps));
    const frames = [];
    for (let i = 0; i < n; i++) {
      check(signal);
      const t = edit.start + (i + 0.5) * (part / n); // middle of each slot, avoids getting the previous frame
      await seek(video, Math.min(t, video.duration - 0.001));
      compose(ctx, video, video.videoWidth, video.videoHeight, edit);
      frames.push({ bitmap: await createImageBitmap(c), duration: 1000 / fps });
      onProgress && onProgress(i / n);
    }
    return frames;
  }

  async function fromAnimated(file, edit, { signal, onProgress }) {
    if (typeof ImageDecoder === "undefined") throw new Error("frames.noDecoder");
    const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type || "image/gif" });
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack.frameCount;
    const { c, ctx } = newCanvas();
    const frames = [];
    let t = 0;
    for (let i = 0; i < count; i++) {
      check(signal);
      const { image } = await dec.decode({ frameIndex: i });
      let ms = (image.duration || 100000) / 1000;
      if (ms <= 10) ms = 100; // what browsers do with "too fast" GIF frames
      const inRange = t + ms > edit.start * 1000 && (!edit.end || t < edit.end * 1000);
      if (inRange) {
        compose(ctx, image, image.displayWidth, image.displayHeight, edit);
        frames.push({ bitmap: await createImageBitmap(c), duration: ms / edit.speed });
      }
      image.close();
      t += ms;
      onProgress && onProgress(i / count);
    }
    dec.close();
    return frames;
  }

  async function fromImage(bitmap, edit, durationMs) {
    const { c, ctx } = newCanvas();
    compose(ctx, bitmap, bitmap.width, bitmap.height, edit);
    return [{ bitmap: await createImageBitmap(c), duration: Math.max(100, durationMs) }];
  }

  // "Voice sticker": a sound wave that moves with the audio, over a photo or a plain colour card.
  async function fromAudio(pcm, edit, { fps = 12, photo, signal, onProgress }) {
    const { c, ctx } = newCanvas();
    const seconds = pcm.length / WASI.audio.RATE;
    const n = Math.max(1, Math.round(seconds * fps));
    const env = WASI.audio.peaks(pcm, n * 4);
    const bars = 9;
    const frames = [];
    for (let i = 0; i < n; i++) {
      check(signal);
      const level = Math.min(1, (env[i * 4] + env[i * 4 + 1] + env[i * 4 + 2] + env[i * 4 + 3]) / 2.4);
      const extra = {
        background: (g, side) => {
          if (photo) return;
          // Brand card: Electric Lime circle with an ink ring and a hard ink shadow.
          const r = side * 0.43;
          g.fillStyle = "#080808";
          g.beginPath();
          g.arc(side / 2 + side * 0.02, side / 2 + side * 0.02, r, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#d6ff36";
          g.strokeStyle = "#080808";
          g.lineWidth = side * 0.022;
          g.beginPath();
          g.arc(side / 2, side / 2, r, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        },
        overlay: (g, side) => {
          const w = side * 0.045;
          const gap = side * 0.03;
          const total = bars * w + (bars - 1) * gap;
          const x0 = (side - total) / 2;
          for (let b = 0; b < bars; b++) {
            const shape = 0.35 + 0.65 * Math.sin(((b + 0.5) / bars) * Math.PI);
            const wobble = 0.6 + 0.4 * Math.sin(i * 1.7 + b * 1.3);
            const h = side * (0.06 + 0.3 * level * shape * wobble);
            g.fillStyle = photo ? "#d6ff36" : "#080808";
            const x = x0 + b * (w + gap);
            const y = (photo ? side * 0.62 : side / 2) - h / 2;
            g.beginPath();
            g.roundRect(x, y, w, h, w / 2);
            g.fill();
          }
        },
      };
      compose(ctx, photo || null, photo ? photo.width : 0, photo ? photo.height : 0, edit, extra);
      frames.push({ bitmap: await createImageBitmap(c), duration: 1000 / fps });
      onProgress && onProgress(i / n);
    }
    return frames;
  }

  // Plays the frames forward, then backward ("boomerang").
  function boomerang(frames) {
    if (frames.length < 3) return frames;
    const back = frames.slice(1, -1).reverse().map((f) => ({ bitmap: f.bitmap, duration: f.duration }));
    return frames.concat(back);
  }

  // Merges frames that look the same into one longer frame (smaller file, same look).
  async function dedupe(frames) {
    const tiny = new OffscreenCanvas(16, 16);
    const g = tiny.getContext("2d", { willReadFrequently: true });
    let prev = null;
    const out = [];
    for (const f of frames) {
      g.clearRect(0, 0, 16, 16);
      g.drawImage(f.bitmap, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data;
      if (prev) {
        let diff = 0;
        for (let i = 0; i < d.length; i++) diff += Math.abs(d[i] - prev[i]);
        if (diff / d.length < 1.5) {
          out[out.length - 1].duration += f.duration;
          continue;
        }
      }
      prev = d.slice();
      out.push({ bitmap: f.bitmap, duration: f.duration });
    }
    return out;
  }

  WASI.frames = { kindOf, openVideo, fromVideo, fromAnimated, fromImage, fromAudio, boomerang, dedupe, compose, SIDE };
})(typeof globalThis !== "undefined" ? globalThis : this);
