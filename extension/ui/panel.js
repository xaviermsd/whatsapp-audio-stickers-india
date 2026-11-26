// The panel inside WhatsApp Web. Plain DOM in a Shadow root (no innerHTML: WhatsApp uses Trusted Types).
// Screen state lives in two machines: StickerJob (state/stickerJob.js) and Recorder (state/recorder.js).
// The panel shows them as data attributes: data-wasi-state, data-wasi-tab, data-wasi-rec on the host.

(function (root) {
  "use strict";
  const WASI = (root.WASI = root.WASI || {});
  const J = root.StickerJob;
  const R = root.Recorder;
  const REPO_URL = "https://github.com/xaviermsd/whatsapp-audio-stickers-india";
  const SERVICES_URL = "https://www.worklancio.in/services?utm_source=github&utm_medium=extension&utm_campaign=wa-audio-stickers";
  const WHATSAPP_URL = "https://wa.me/919898528376";
  const EMOJIS = ["🔊", "😂", "🤣", "😎", "😍", "🙏", "🔥", "🎉", "😡", "😭", "👍", "💯"];

  const { t } = WASI.i18n;
  const { icon, mark } = WASI.icons;

  // ---------- tiny DOM helper ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "style") el.style.cssText = v;
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
    return el;
  }
  const stepTitle = (n, key) => h("h2", {}, h("span", { class: "step", text: String(n) }), t(key));
  const btn = (label, iconName, onclick, cls = "btn") =>
    h("button", { class: cls, type: "button", onclick }, iconName ? icon(iconName) : null, h("span", { text: label }));

  // ---------- state ----------
  let job = J.initial();
  let rec = R.initial();
  let tab = "make";
  let open = false;
  let prefs = { lang: "en", pack: "", author: "", emoji: "🔊", fit: "cover", textPos: "bottom" };
  let src = null; // { kind, file, url, video, bitmap, buffer, photo, photoUrl, sound, soundName, previewUrls }
  let built = null; // { webp, ogg, seconds, side, emoji, webpUrl, oggUrl, savedId }
  let library = [];
  let libCount = 0; // shown on the tab; the full list loads only when the My stickers tab is open
  let libRun = 0; // newest library request wins
  let status = { kind: "", text: "" };
  let abort = null;
  let recording = null; // { stream, recorder, chunks, timer, started }

  let host, shadow, panel, mainEl, launcher;
  let logoUrl = null;
  const logo = () => (logoUrl ? h("img", { class: "mark", src: logoUrl, alt: "" }) : mark());

  function dispatch(event) {
    try {
      const res = J.transition(job, event);
      if (res.stale) return false;
      job = res.job;
    } catch (e) {
      console.warn("[audio stickers]", e.message);
      return false;
    }
    host.dataset.wasiState = job.state;
    return true;
  }

  function setStatus(kind, key) {
    status = { kind, text: key ? t(key) : "" };
    const el = shadow.querySelector(".status");
    if (el) {
      el.dataset.kind = status.kind;
      el.textContent = status.text;
    }
  }

  function errorKey(e) {
    const m = (e && e.message) || "";
    return WASI.i18n.T.en[m] ? m : e && e.name === "NotAllowedError" ? "micDenied" : "sendFailed";
  }

  // ---------- mount ----------
  function mount() {
    if (host) return;
    host = h("div", { id: "wasi-india-root" });
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = WASI.css;
    shadow.append(style);
    const wrap = h("div", { class: "wasi" });
    shadow.append(wrap);
    launcher = buildHandle();
    panel = h("div", { class: "panel", role: "dialog", "aria-label": t("title"), hidden: true });
    wrap.append(launcher, panel);
    setupPanelDrop();
    document.documentElement.append(host);
    applyTheme();
    new MutationObserver(applyTheme).observe(document.body || document.documentElement, { attributes: true, attributeFilter: ["class"] });
    host.dataset.wasiState = job.state;
    host.dataset.wasiTab = tab;
    host.dataset.wasiRec = rec.state;
    shadow.addEventListener("keydown", (e) => {
      if (e.key === "Escape") toggle(false);
      e.stopPropagation(); // keep WhatsApp shortcuts from firing while typing in the panel
    });
    document.addEventListener("paste", onPaste, true);
    WASI.store
      .fonts()
      .then((list) => {
        for (const f of list) {
          const face = new FontFace("Baloo 2", f.buf, { weight: "400 800", unicodeRange: f.range, display: "swap" });
          document.fonts.add(face);
          face.load().catch(() => {});
        }
      })
      .catch(() => {}); // system fonts are fine too
    WASI.store
      .brand()
      .then((b) => {
        logoUrl = URL.createObjectURL(new Blob([b.buf], { type: "image/png" }));
        const old = panel.querySelector(".mark");
        if (old) old.replaceWith(logo());
        const hl = launcher.querySelector(".handle-logo");
        if (hl) hl.replaceChildren(h("img", { src: logoUrl, alt: "", draggable: "false" }));
      })
      .catch(() => {}); // the drawn placeholder mark stays
    WASI.store
      .getPrefs()
      .then((p) => {
        // first launch: follow the browser's language (Hindi browsers open in Hindi); a saved choice always wins
        if (!p || !p.lang) p = { ...p, lang: /^hi\b/i.test(navigator.language || "") ? "hi" : "en" };
        prefs = { ...prefs, ...p };
        WASI.i18n.setLang(prefs.lang);
        placeHandle(Number(prefs.handleY));
        refreshLibrary();
        render();
      })
      .catch(() => render());
    render();
  }

  function applyTheme() {
    const dark = (document.body && document.body.classList.contains("dark")) || root.matchMedia("(prefers-color-scheme: dark)").matches;
    shadow.querySelector(".wasi").dataset.theme = dark ? "dark" : "light";
  }

  // ---------- handle: one tab that rides with the panel; click to open or close, drag up or down ----------
  function buildHandle() {
    const waves = h("span", { class: "handle-waves", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i"));
    const chev = h("span", { class: "handle-chev", "aria-hidden": "true" }, icon("chevron"));
    const grip = h("span", { class: "handle-grip", "aria-hidden": "true" });
    const btn = h("button", { class: "handle launcher", type: "button", "aria-expanded": "false" },
      h("span", { class: "handle-logo", "aria-hidden": "true" }, icon("sound")), waves, chev, grip);
    let start = null;
    let dragged = false;
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      start = { y: e.clientY, top: btn.getBoundingClientRect().top + btn.offsetHeight / 2 };
      dragged = false;
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener("pointermove", (e) => {
      if (!start) return;
      const dy = e.clientY - start.y;
      if (!dragged && Math.abs(dy) < 6) return;
      dragged = true;
      btn.classList.add("dragging");
      placeHandle(((start.top + dy) / root.innerHeight) * 100);
    });
    // the browser's own image or link drag would cancel ours
    btn.addEventListener("dragstart", (e) => e.preventDefault());
    btn.addEventListener("pointercancel", () => {
      start = null;
      btn.classList.remove("dragging");
    });
    btn.addEventListener("pointerup", () => {
      if (!start) return;
      start = null;
      btn.classList.remove("dragging");
      if (dragged) savePrefs({ handleY: Math.round(handleY) });
    });
    btn.addEventListener("click", (e) => {
      if (dragged) {
        e.preventDefault();
        dragged = false;
        return;
      }
      toggle();
    });
    btn.addEventListener("keydown", (e) => {
      // arrow keys move it, for people who do not use a mouse
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        placeHandle(handleY + (e.key === "ArrowUp" ? -4 : 4));
        savePrefs({ handleY: Math.round(handleY) });
      }
    });
    return btn;
  }

  let handleY = 42;
  function placeHandle(pct) {
    if (!Number.isFinite(pct)) return;
    handleY = Math.max(12, Math.min(88, pct));
    launcher.style.setProperty("--hy", handleY + "%");
  }

  function labelHandle() {
    const label = open ? t("closePanel") : t("launcher");
    launcher.setAttribute("aria-label", label + ". " + t("handleHint"));
    launcher.title = label + "\n" + t("handleHint");
    launcher.setAttribute("aria-expanded", String(open));
    launcher.classList.toggle("is-open", open);
  }

  function toggle(force) {
    open = typeof force === "boolean" ? force : !open;
    panel.hidden = !open;
    host.dataset.wasiOpen = String(open);
    labelHandle();
    if (open) {
      const first = panel.querySelector("button, input");
      if (first) first.focus({ preventScroll: true });
    } else {
      // nothing keeps playing behind a closed panel
      stopPart();
      panel.querySelectorAll("video, audio").forEach((m) => m.pause());
    }
  }

  function savePrefs(patch) {
    prefs = { ...prefs, ...patch };
    WASI.store.setPrefs(patch).catch(() => {});
  }

  // ---------- render ----------
  function render() {
    host.dataset.wasiTab = tab;
    panel.setAttribute("aria-label", t("title"));
    labelHandle();
    panel.replaceChildren(header(), nav(), (mainEl = h("main", {}, tab === "make" ? makeTab() : tab === "library" ? libraryTab() : helpTab())), footer());
  }

  function header() {
    return h(
      "header",
      {},
      logo(),
      h("div", { class: "titles" }, h("h1", {}, t("title"), h("span", { class: "tag", text: "INDIA" })), h("p", { class: "tagline", text: t("tagline") })),
      h(
        "div",
        { class: "lang", role: "group", "aria-label": "Language" },
        WASI.i18n.LANGS.map((l) =>
          h("button", {
            type: "button",
            text: l.label,
            "aria-pressed": String(WASI.i18n.lang === l.code),
            onclick: () => {
              WASI.i18n.setLang(l.code);
              savePrefs({ lang: l.code });
              render();
            },
          })
        )
      ),
      h("button", { class: "iconbtn", type: "button", "aria-label": t("close"), title: t("close"), onclick: () => toggle(false) }, icon("close"))
    );
  }

  function nav() {
    const tabs = [
      ["make", t("tabMake")],
      ["library", t("tabLibrary")],
      ["help", t("tabHelp")],
    ];
    return h(
      "nav",
      { role: "tablist" },
      tabs.map(([id, label]) =>
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": String(tab === id),
            onclick: () => {
              tab = id;
              render();
              if (id === "library") refreshLibrary();
            },
          },
          label,
          id === "library" && libCount ? h("span", { class: "count", text: String(libCount) }) : null
        )
      )
    );
  }

  function footer() {
    return h("footer", {}, h("span", { text: t("footer") }), h("span", { "aria-hidden": "true", text: "·" }), h("a", { href: SERVICES_URL, target: "_blank", rel: "noopener noreferrer", text: "worklancio.in" }));
  }

  // ---------- Make tab ----------
  function makeTab() {
    const parts = [];
    if (job.state === "empty" || job.state === "loading" || (job.state === "error" && !src)) parts.push(pickSection());
    else parts.push(sourceSection(), editSection(), buildSection());
    parts.push(h("div", { class: "status", "data-kind": status.kind, role: "status", "aria-live": "polite", text: status.text }));
    return parts;
  }

  function filePicker(accept, onFile) {
    const input = h("input", { type: "file", accept, hidden: true });
    input.addEventListener("change", () => input.files[0] && onFile(input.files[0]));
    return input;
  }

  function pickSection() {
    if (rec.state === "recording" || rec.state === "asking") return recordSection();
    const input = filePicker("video/*,image/*,audio/*,.gif,.webp,.mp3,.m4a,.ogg,.opus,.wav", pick);
    const drop = h(
      "div",
      {
        class: "drop",
        role: "button",
        tabindex: "0",
        onclick: () => input.click(),
        onkeydown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.click()),
        ondragover: (e) => {
          e.preventDefault();
          drop.dataset.over = "true";
        },
        ondragleave: () => (drop.dataset.over = "false"),
        ondrop: () => (drop.dataset.over = "false"), // the panel-wide drop handler takes the file
      },
      h("span", { class: "bubble" }, icon("upload")),
      h("strong", { text: job.state === "loading" ? J.LABELS.loading[WASI.i18n.lang] || J.LABELS.loading.en : t("drop") }),
      h("p", { text: t("dropHint") })
    );
    return h(
      "section",
      {},
      stepTitle(1, "step1"),
      drop,
      input,
      h("div", { class: "row", style: "margin-top:10px" }, btn(t("recordVoice"), "mic", () => startRecording("voice")), btn(t("recordVideo"), "video", () => startRecording("video")))
    );
  }

  function recordSection() {
    const box = h("div", { class: "recbox" });
    if (recording && recording.kind === "video" && recording.stream) {
      const v = h("video", { muted: true, autoplay: true, playsInline: true, style: "width:100%;max-width:240px;aspect-ratio:1/1;object-fit:cover;border-radius:12px;background:#000" });
      v.srcObject = recording.stream;
      box.append(v);
    }
    box.append(
      h("div", { class: "row" }, h("span", { class: "recdot" }), h("span", { text: t("recording") })),
      h("div", { class: "rectime", text: `${rec.seconds.toFixed(1)} / ${R.MAX_SECONDS}${t("seconds")}` }),
      btn(t("stopRecording"), "stop", stopRecording, "btn primary")
    );
    return h("section", {}, stepTitle(1, "step1"), box);
  }

  function sourceSection() {
    const s = src || {};
    const pv = h("div", { class: "preview" });
    if (s.kind === "video") {
      s.video.controls = true;
      s.video.muted = false;
      s.video.style.cssText = "";
      pv.append(s.video);
    } else if (s.kind === "image" || s.kind === "animated") {
      pv.append(h("img", { src: s.url, alt: "" }));
    } else if (s.kind === "audio") {
      if (s.photoUrl) pv.append(h("img", { src: s.photoUrl, alt: "" }));
      else pv.append(voicePreview());
    }
    const extra = [];
    if (s.kind === "audio") {
      const ph = filePicker("image/*", async (f) => {
        try {
          s.photo = await createImageBitmap(f);
          s.photoUrl = URL.createObjectURL(f);
          s.previewUrls.push(s.photoUrl);
          dispatch({ type: "edit", edit: {} });
          render();
        } catch (_) {
          setStatus("bad", "unknownFile");
        }
      });
      extra.push(
        h(
          "div",
          { class: "row" },
          ph,
          s.photo
            ? btn(t("removePhoto"), "trash", () => {
                s.photo = null;
                s.photoUrl = null;
                dispatch({ type: "edit", edit: {} });
                render();
              }, "btn small")
            : btn(t("addPhoto"), "image", () => ph.click(), "btn small")
        )
      );
    }
    if (s.kind === "video" || s.kind === "animated" || s.kind === "image") {
      const sp = filePicker("audio/*,video/*,.mp3,.m4a,.ogg,.opus,.wav", async (f) => {
        try {
          s.sound = await WASI.audio.decode(await f.arrayBuffer());
          s.soundName = f.name;
          s.soundUrl = URL.createObjectURL(f);
          s.previewUrls.push(s.soundUrl);
          if (s.kind === "image") dispatch({ type: "edit", edit: { start: 0, end: Math.min(s.sound.duration, 10) } }), (job = { ...job, clip: { ...job.clip, duration: s.sound.duration } });
          else dispatch({ type: "edit", edit: {} });
          setStatus("", "");
          render();
        } catch (e) {
          setStatus("bad", errorKey(e));
        }
      });
      const own = s.kind === "video" && s.buffer;
      extra.push(
        h(
          "div",
          { class: "field" },
          h("span", { class: "label", text: t("soundFrom") }),
          h(
            "div",
            { class: "chips" },
            own ? h("button", { class: "chip", type: "button", "aria-pressed": String(!s.sound), text: t("soundOwn"), onclick: () => ((s.sound = null), (s.soundName = ""), dispatch({ type: "edit", edit: {} }), render()) }) : null,
            h("button", { class: "chip", type: "button", "aria-pressed": String(Boolean(s.sound)), text: s.soundName ? s.soundName.slice(0, 24) : t("pickSound"), onclick: () => sp.click() }),
            sp
          )
        )
      );
    }
    return h(
      "section",
      {},
      stepTitle(1, "step1"),
      pv,
      h("div", { class: "row clip-row" }, h("span", { class: "filename", style: "flex:1", text: s.file ? s.file.name : "" }), changePicker(), btn(t("changeClip"), "upload", () => mainEl.querySelector(".change-picker").click(), "btn small"), btn(t("removeClip"), "trash", () => startOver(), "btn small danger")),
      extra
    );
  }

  function voicePreview() {
    const c = h("canvas", { width: 512, height: 512 });
    WASI.frames
      .fromAudio(new Float32Array(48000).map((_, i) => Math.sin(i / 30) * 0.5), job.edit, { fps: 1 })
      .then((fr) => {
        const g = c.getContext("2d");
        g.drawImage(fr[0].bitmap, 0, 0);
        fr[0].bitmap.close();
      })
      .catch(() => {});
    return c;
  }

  // ---------- trim bar: waveform, two handles, drag the window, play the part, exact From and To ----------
  // Every change goes through the job machine (dispatch edit), which clamps to the clip and to MAX_SECONDS.
  let partPlayer = null; // { media, own, raf, stopAt } while "Play this part" runs
  function stopPart() {
    if (!partPlayer) return;
    cancelAnimationFrame(partPlayer.raf);
    partPlayer.media.pause();
    if (partPlayer.own) partPlayer.media.removeAttribute("src");
    partPlayer = null;
    const b = mainEl && mainEl.querySelector(".trim-play");
    if (b) b.replaceWith(playPartButton());
    const ph = mainEl && mainEl.querySelector(".trim-head");
    if (ph) ph.style.opacity = "0";
  }

  function playPartButton() {
    return btn(partPlayer ? t("stopPart") : t("playPart"), partPlayer ? "stop" : "play", () => (partPlayer ? stopPart() : playPart()), "btn small trim-play");
  }

  function playPart() {
    stopPart();
    const e = job.edit;
    // the sound the sticker will use: another file if picked, else the clip itself
    let media;
    let own = false;
    if (src.sound && src.soundUrl) {
      media = new Audio(src.soundUrl);
      own = true;
    } else if (src.kind === "video") {
      media = src.video;
      media.muted = false;
    } else {
      media = new Audio(src.url);
      own = true;
    }
    media.playbackRate = e.speed;
    media.currentTime = e.start;
    partPlayer = { media, own, raf: 0, stopAt: e.end };
    const head = mainEl.querySelector(".trim-head");
    const dur = (job.clip && job.clip.duration) || 1;
    const tick = () => {
      if (!partPlayer) return;
      const tt = media.currentTime;
      if (head) {
        head.style.opacity = "1";
        head.style.left = `calc(10px + (100% - 20px) * ${Math.max(0, Math.min(1, (tt - viewStart()) / viewLen()))})`;
      }
      if (tt >= partPlayer.stopAt || media.ended) return stopPart();
      partPlayer.raf = requestAnimationFrame(tick);
    };
    media
      .play()
      .then(() => {
        if (partPlayer) partPlayer.raf = requestAnimationFrame(tick);
      })
      .catch(() => stopPart());
    const b = mainEl.querySelector(".trim-play");
    if (b) b.replaceWith(playPartButton());
  }

  let viewStart = () => 0;
  let viewLen = () => (job.clip && job.clip.duration) || 1;
  function trimBar(dur, showLength, lengthEl) {
    const W = 760;
    const H = 112; // canvas pixels (drawn at 2x for sharp lines)
    const wave = h("canvas", { class: "trim-wave", width: W, height: H, "aria-hidden": "true" });
    const sel = h("div", { class: "trim-sel" });
    const head = h("div", { class: "trim-head", "aria-hidden": "true" });
    const mkHandle = (key) =>
      h("div", {
        class: "trim-handle trim-" + key,
        role: "slider",
        tabindex: "0",
        "aria-label": key === "start" ? t("start") : t("end"),
        "aria-valuemin": "0",
        "aria-valuemax": dur.toFixed(2),
      });
    // Long clips: the bar shows a 30 s window around the selection (a 3 s part of a 150 s clip would be 7 px wide)
    const VIEW = Math.min(dur, 30);
    let v0 = 0;
    function ensureView() {
      const e = job.edit;
      if (dur <= VIEW) return (v0 = 0);
      if (e.start < v0 || e.end > v0 + VIEW) v0 = Math.max(0, Math.min(dur - VIEW, (e.start + e.end) / 2 - VIEW / 2));
    }
    ensureView();
    viewStart = () => v0;
    viewLen = () => VIEW;
    const viewNote = h("span", { class: "length trim-view" });
    const hs = mkHandle("start");
    const he = mkHandle("end");
    const track = h("div", { class: "trim-track" }, wave, sel, head, hs, he);

    const num = (key) => {
      const input = h("input", {
        type: "number",
        min: "0",
        max: dur.toFixed(2),
        step: "0.1",
        value: job.edit[key].toFixed(1),
        class: "trim-num",
        "aria-label": key === "start" ? t("from") : t("to"),
      });
      input.dataset.k = key; // the screenshot and demo scripts set times through these
      input.addEventListener("input", () => {
        if (input.value !== "") setRange({ [key]: Number(input.value) }, key, false);
      });
      input.addEventListener("change", () => paint(true));
      return input;
    };
    const from = num("start");
    const to = num("end");

    // the sound to draw: another file if picked, else the clip's own sound
    const buf = src.sound || src.buffer;
    const bars = Math.max(60, Math.min(4000, Math.round((190 * dur) / VIEW)));
    const peaks = buf ? WASI.audio.peaks(buf, bars) : null;
    let max = 0.0001;
    if (peaks) for (const p of peaks) max = Math.max(max, p);

    function drawWave() {
      const g = wave.getContext("2d");
      g.clearRect(0, 0, W, H);
      const styles = getComputedStyle(wave);
      const on = styles.getPropertyValue("--wave-on").trim() || "#080808";
      const off = styles.getPropertyValue("--wave-off").trim() || "#c9c9c4";
      const i0 = Math.floor((v0 / dur) * bars);
      const n = Math.max(1, Math.round((VIEW / dur) * bars));
      const bw = W / n;
      for (let k = 0; k < n; k++) {
        const i = Math.min(bars - 1, i0 + k);
        const tt = ((i + 0.5) / bars) * dur;
        const inside = tt >= job.edit.start && tt <= job.edit.end;
        const v = peaks ? Math.max(0.04, peaks[i] / max) : 0.04;
        const bh = Math.max(4, v * (H - 16));
        g.fillStyle = inside ? on : off;
        g.beginPath();
        g.roundRect(k * bw + bw * 0.18, (H - bh) / 2, Math.max(2, bw * 0.64), bh, 2);
        g.fill();
      }
    }

    // forceNums: rewrite the number boxes even if one has focus (after the person leaves the box)
    function paint(forceNums) {
      const e = job.edit;
      ensureView();
      const a = Math.max(0, Math.min(100, ((e.start - v0) / VIEW) * 100));
      const b = Math.max(0, Math.min(100, ((e.end - v0) / VIEW) * 100));
      viewNote.textContent = dur > VIEW ? t("trimView").replace("{a}", v0.toFixed(1)).replace("{b}", (v0 + VIEW).toFixed(1)).replace("{d}", dur.toFixed(1)) : "";
      // positions map onto the inner width (the waveform has a 10 px margin each side)
      const at = (p) => `calc(10px + (100% - 20px) * ${p / 100})`;
      sel.style.left = at(a);
      sel.style.width = `calc((100% - 20px) * ${Math.max(0, b - a) / 100})`;
      hs.style.left = at(a);
      he.style.left = at(b);
      hs.setAttribute("aria-valuenow", e.start.toFixed(2));
      hs.setAttribute("aria-valuetext", e.start.toFixed(1) + " " + t("seconds"));
      he.setAttribute("aria-valuenow", e.end.toFixed(2));
      he.setAttribute("aria-valuetext", e.end.toFixed(1) + " " + t("seconds"));
      const focused = shadow.activeElement;
      if (forceNums || focused !== from) from.value = e.start.toFixed(1);
      if (forceNums || focused !== to) to.value = e.end.toFixed(1);
      showLength();
      drawWave();
    }

    // moves the range; "lead" is the end being moved, so the other one follows when needed
    function setRange(patch, lead, seek = true) {
      const MIN = 0.3;
      let start = patch.start !== undefined ? patch.start : job.edit.start;
      let end = patch.end !== undefined ? patch.end : job.edit.end;
      start = Math.max(0, Math.min(dur, start));
      end = Math.max(0, Math.min(dur, end));
      if (lead === "start") {
        if (end - start < MIN) end = Math.min(dur, start + MIN);
        if (end - start > J.MAX_SECONDS) end = start + J.MAX_SECONDS;
      } else if (lead === "end") {
        if (end - start < MIN) start = Math.max(0, end - MIN);
        if (end - start > J.MAX_SECONDS) start = end - J.MAX_SECONDS;
      }
      stopPart();
      dispatch({ type: "edit", edit: { start, end } });
      if (seek && src && src.kind === "video") src.video.currentTime = lead === "end" ? job.edit.end : job.edit.start;
      paint(false);
      afterEdit();
    }

    // pointer: drag a handle, or drag inside the selection to slide the whole part
    const secAt = (clientX) => {
      const r = track.getBoundingClientRect();
      return Math.max(0, Math.min(dur, v0 + ((clientX - r.left - 10) / (r.width - 20)) * VIEW));
    };
    let drag = null;
    track.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const tt = secAt(ev.clientX);
      const e = job.edit;
      const px = (track.getBoundingClientRect().width - 20) / VIEW;
      const near = (x) => Math.abs(x - tt) * px < 14;
      let mode;
      if (ev.target === hs) mode = "start";
      else if (ev.target === he) mode = "end";
      else if (near(e.start) && !near(e.end)) mode = "start";
      else if (near(e.end)) mode = "end";
      else if (tt > e.start && tt < e.end) mode = "move";
      else mode = tt < e.start ? "start" : "end"; // a click outside pulls the nearest end there
      drag = { mode, t0: tt, s0: e.start, e0: e.end };
      track.setPointerCapture(ev.pointerId);
      track.classList.add("dragging");
      if (mode !== "move") setRange({ [mode]: tt }, mode);
      ev.preventDefault();
    });
    track.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const tt = secAt(ev.clientX);
      if (drag.mode === "move") {
        const len = drag.e0 - drag.s0;
        const s0 = Math.max(0, Math.min(dur - len, drag.s0 + (tt - drag.t0)));
        setRange({ start: s0, end: s0 + len }, null);
      } else setRange({ [drag.mode]: tt }, drag.mode);
    });
    const stopDrag = () => {
      drag = null;
      track.classList.remove("dragging");
    };
    track.addEventListener("pointerup", stopDrag);
    track.addEventListener("pointercancel", stopDrag);

    // keyboard on the handles: arrows 0.1 s, Shift+arrows 1 s, Home and End
    for (const [el, key] of [
      [hs, "start"],
      [he, "end"],
    ]) {
      el.addEventListener("keydown", (ev) => {
        const step = ev.shiftKey ? 1 : 0.1;
        let v = job.edit[key];
        if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") v -= step;
        else if (ev.key === "ArrowRight" || ev.key === "ArrowUp") v += step;
        else if (ev.key === "Home") v = 0;
        else if (ev.key === "End") v = dur;
        else return;
        ev.preventDefault();
        setRange({ [key]: v }, key);
      });
    }

    const box = h(
      "div",
      { class: "field trim-box" },
      track,
      h(
        "div",
        { class: "trim-row" },
        playPartButton(),
        h("label", { class: "trim-time" }, h("span", { text: t("from") }), from),
        h("label", { class: "trim-time" }, h("span", { text: t("to") }), to)
      ),
      lengthEl,
      viewNote,
      buf ? null : h("span", { class: "length", text: t("noSoundYet") })
    );
    requestAnimationFrame(() => paint(true));
    return box;
  }

  function editSection() {
    const e = job.edit;
    const dur = (job.clip && job.clip.duration) || 0;
    const fmt = (v) => `${v.toFixed(1)}${t("seconds")}`;
    const lengthEl = h("span", { class: "length" });
    const showLength = () => (lengthEl.textContent = `${t("length")}: ${fmt((job.edit.end - job.edit.start) / job.edit.speed)} / ${J.MAX_SECONDS}${t("seconds")}`);
    showLength();

    function chips(key, options, extraClass) {
      return h(
        "div",
        { class: extraClass ? "chips " + extraClass : "chips" },
        options.map(([value, label]) =>
          h("button", {
            class: "chip",
            type: "button",
            text: label,
            "aria-pressed": String(job.edit[key] === value),
            onclick: (ev) => {
              dispatch({ type: "edit", edit: { [key]: value } });
              for (const b of ev.currentTarget.parentElement.children) b.setAttribute("aria-pressed", String(b === ev.currentTarget));
              if (["emoji", "fit", "textPos"].includes(key)) savePrefs({ [key]: value });
              showLength();
              afterEdit();
            },
          })
        )
      );
    }

    function check(key, label) {
      const input = h("input", { type: "checkbox", checked: Boolean(e[key]) });
      input.addEventListener("change", () => {
        dispatch({ type: "edit", edit: { [key]: input.checked } });
        afterEdit();
      });
      return h("label", { class: "check" }, input, h("span", { text: label }));
    }

    const vol = h("input", { type: "range", min: "0", max: "2", step: "0.05", value: String(e.volume), "aria-label": t("volume") });
    const volOut = h("span", { text: `${Math.round(e.volume * 100)}%` });
    vol.addEventListener("input", () => {
      dispatch({ type: "edit", edit: { volume: Number(vol.value) } });
      volOut.textContent = `${Math.round(job.edit.volume * 100)}%`;
      afterEdit();
    });

    const caption = h("input", { type: "text", maxLength: 40, value: e.text, placeholder: t("captionPlaceholder"), "aria-label": t("caption") });
    caption.addEventListener("input", () => {
      dispatch({ type: "edit", edit: { text: caption.value } });
      afterEdit();
    });

    const pack = h("input", { type: "text", maxLength: 60, value: prefs.pack || "", "aria-label": t("pack") });
    const author = h("input", { type: "text", maxLength: 60, value: prefs.author || "", "aria-label": t("author") });
    pack.addEventListener("change", () => savePrefs({ pack: pack.value.trim() }));
    author.addEventListener("change", () => savePrefs({ author: author.value.trim() }));

    const moving = src && (src.kind === "video" || src.kind === "animated");
    return h(
      "section",
      {},
      stepTitle(2, "step2"),
      dur > 0 && src.kind !== "animated" ? trimBar(dur, showLength, lengthEl) : null,
      h("div", { class: "field" }, h("span", { class: "label", text: t("speed") }), chips("speed", J.SPEEDS.map((s) => [s, `${s}x`]))),
      moving ? h("div", { class: "field" }, check("boomerang", t("boomerang"))) : null,
      h("div", { class: "field" }, h("div", { class: "trim" }, h("span", { class: "label", text: t("volume") }), vol, volOut), check("louder", t("louder")), check("fade", t("fade"))),
      src && src.kind !== "audio" ? h("div", { class: "field" }, h("span", { class: "label", text: t("frame") }), chips("fit", [["cover", t("crop")], ["contain", t("fit")]])) : null,
      h("div", { class: "field" }, h("label", { text: t("caption") }), caption, chips("textPos", [["top", t("top")], ["bottom", t("bottom")]])),
      h("div", { class: "field" }, h("span", { class: "label", text: t("emoji") }), chips("emoji", EMOJIS.map((x) => [x, x]), "emoji")),
      h("div", { class: "field" }, h("details", {}, h("summary", { text: t("packDetails") }), h("div", { class: "field" }, h("label", { text: t("pack") }), pack), h("div", { class: "field" }, h("label", { text: t("author") }), author)))
    );
  }

  // Any edit after a build drops the built sticker (the machine already did); refresh the build area.
  function afterEdit() {
    if (built) {
      freeBuilt();
      const sec = mainEl.querySelector("[data-build]");
      sec && sec.replaceWith(buildSection());
    }
  }

  function buildSection() {
    const sec = h("section", { "data-build": "" }, stepTitle(3, "step3"));
    if (job.state === "building") {
      const bar = h("div", {}, h("div", { style: `width:${Math.round(job.progress * 100)}%` }));
      bar.className = "progress";
      const art = h(
        "div",
        { class: "buildart", "aria-hidden": "true" },
        h("div", { class: "buildart-ring" }),
        logoUrl ? h("img", { class: "buildart-logo", src: logoUrl, alt: "", draggable: "false" }) : h("div", { class: "buildart-logo" }, icon("sound")),
        h("div", { class: "buildart-waves" }, h("i"), h("i"), h("i"), h("i"), h("i"))
      );
      sec.append(
        h(
          "div",
          { class: "buildbox", role: "status", "aria-live": "polite" },
          art,
          h("div", { class: "buildpct", text: Math.round(job.progress * 100) + "%" }),
          h("p", { class: "buildstage", text: stageText(job.progress) }),
          bar,
          h("div", { class: "row", style: "justify-content:center;margin-top:12px" }, btn(t("cancel"), "close", cancelBuild, "btn small"))
        )
      );
      return sec;
    }
    if (built && (job.state === "ready" || job.state === "sending" || job.state === "sent" || job.state === "error")) {
      const audio = h("audio", { src: built.oggUrl, preload: "auto" });
      const img = h("img", { src: built.webpUrl, alt: "" });
      sec.append(
        h("div", { class: "preview" }, img),
        audio,
        h("div", { class: "row", style: "justify-content:center;margin-bottom:12px" },
          btn(t("playSound"), "play", () => {
            img.src = built.webpUrl + "#" + Date.now(); // restart the animation
            audio.currentTime = 0;
            audio.play().catch(() => {});
          }, "btn small")),
        h("div", { class: "meters" }, meter(t("sizeSticker"), built.webp.length), meter(t("sizeSound"), built.ogg.length)),
        h("div", { class: "row", style: "margin-top:14px" },
          btn(t("sendHere"), "send", () => sendBuilt("open"), "btn primary wide")),
        h("div", { class: "row" },
          btn(t("sendMe"), "user", () => sendBuilt("me"), "btn small"),
          btn(built.savedId ? t("saved") : t("save"), "save", saveBuilt, "btn small"),
          btn(t("download"), "download", () => download(built), "btn small")),
        h("div", { class: "row another-row" }, btn(t("makeAnother"), "refresh", () => startOver(), "btn small ghost"))
      );
      if (job.state === "sending") sec.querySelectorAll("button").forEach((b) => (b.disabled = true));
      return sec;
    }
    sec.append(h("div", { class: "row" }, btn(t("make"), "sound", startBuild, "btn primary wide")));
    return sec;
  }

  function meter(label, bytes) {
    const pct = Math.min(100, (bytes / 1000000) * 100);
    return h("div", { class: "meter" }, h("span", { text: label }), h("div", { class: "bar" }, h("div", { style: `width:${pct}%` })), h("span", { text: `${Math.round(bytes / 1000)} KB ${t("ofLimit")}` }));
  }

  function refreshBuild() {
    const sec = mainEl && mainEl.querySelector("[data-build]");
    if (sec) sec.replaceWith(buildSection());
  }

  // ---------- start over, change the clip ----------
  // Which part of the work is running, from the progress the build reports (sound 0-10%, frames 10-55%, file 55-100%).
  function stageText(p) {
    return p < 0.1 ? t("stageSound") : p < 0.55 ? t("stageFrames") : t("stagePack");
  }

  // A sticker that was made but neither sent nor saved would be lost: ask first.
  function startOver() {
    const unsent = built && !built.savedId && job.state !== "sent";
    if (unsent && !root.confirm(t("confirmDiscard"))) return;
    resetToPick();
  }

  // A hidden file input that swaps the clip straight away (no trip back to the empty screen).
  function changePicker() {
    const input = h("input", { type: "file", class: "change-picker", accept: "video/*,image/*,audio/*,.gif,.webp,.mp3,.m4a,.ogg,.opus,.wav", hidden: true });
    input.addEventListener("change", () => {
      const f = input.files[0];
      if (!f) return;
      const unsent = built && !built.savedId && job.state !== "sent";
      if (unsent && !root.confirm(t("confirmDiscard"))) return;
      cancelBuild();
      pick(f);
    });
    return input;
  }

  // Drag a file anywhere over the panel: a lime cover with a bouncing icon, drop to use it (replaces the clip).
  function setupPanelDrop() {
    let depth = 0;
    const cover = h(
      "div",
      { class: "dropcover", "aria-hidden": "true" },
      h("div", { class: "dropcover-card" }, h("span", { class: "dropcover-icon" }, icon("upload")), h("strong", { text: t("dropHere") }), h("span", { text: t("dropKinds") }))
    );
    panel.parentElement.append(cover);
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const show = (on) => {
      cover.classList.toggle("on", on);
      host.dataset.wasiDrag = String(on);
    };
    panel.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      show(true);
    });
    panel.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    panel.addEventListener("dragleave", (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) show(false);
    });
    panel.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      show(false);
      const f = e.dataTransfer.files[0];
      if (!f) return;
      const unsent = built && !built.savedId && job.state !== "sent";
      if (unsent && !root.confirm(t("confirmDiscard"))) return;
      cancelBuild();
      tab = "make";
      pick(f);
    });
  }

  // ---------- loading a clip ----------
  function resetToPick() {
    cancelBuild();
    freeSource();
    freeBuilt();
    dispatch({ type: "reset" });
    setStatus("", "");
    render();
  }

  async function pick(file) {
    const kind = WASI.frames.kindOf(file);
    if (kind === "unknown") {
      setStatus("bad", "unknownFile");
      return;
    }
    freeSource();
    freeBuilt();
    dispatch({ type: "pick", name: file.name });
    const run = job.run;
    setStatus("", "");
    render();
    const s = { kind, file, url: URL.createObjectURL(file), previewUrls: [], video: null, bitmap: null, buffer: null, photo: null, sound: null };
    s.previewUrls.push(s.url);
    try {
      let duration = 0;
      let hasAudio = false;
      if (kind === "video") {
        s.video = await WASI.frames.openVideo(s.url);
        duration = s.video.duration;
        try {
          s.buffer = await WASI.audio.decode(await file.arrayBuffer());
          hasAudio = true;
        } catch (_) {
          hasAudio = false;
        }
      } else if (kind === "audio") {
        s.buffer = await WASI.audio.decode(await file.arrayBuffer());
        duration = s.buffer.duration;
        hasAudio = true;
      } else if (kind === "image") {
        s.bitmap = await createImageBitmap(file);
        duration = 0;
      } else if (kind === "animated") {
        duration = 0;
      }
      src = s;
      if (!dispatch({ type: "loaded", run, clip: { duration, hasAudio, hasVideo: kind !== "audio", kind }, maxSeconds: 10 })) return freeOne(s);
      dispatch({ type: "edit", edit: { emoji: prefs.emoji, fit: prefs.fit, textPos: prefs.textPos } });
      if (duration > J.MAX_SECONDS) setStatus("info", "tooLong");
      if ((kind === "image" || kind === "animated" || (kind === "video" && !hasAudio)) && !s.sound) setStatus("info", "pickSound");
    } catch (e) {
      freeOne(s);
      dispatch({ type: "failed", run, message: t(errorKey(e)) });
      setStatus("bad", errorKey(e));
    }
    render();
  }

  function onPaste(e) {
    if (!open || tab !== "make" || job.state !== "empty") return;
    const f = e.clipboardData && [...e.clipboardData.files][0];
    if (f) {
      e.preventDefault();
      e.stopPropagation();
      pick(f);
    }
  }

  // ---------- recording ----------
  async function startRecording(kind) {
    rec = R.transition(rec, { type: "ask", kind });
    host.dataset.wasiRec = rec.state;
    render();
    try {
      const constraints = kind === "video" ? { audio: true, video: { width: { ideal: 720 }, height: { ideal: 720 }, facingMode: "user" } } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const mime = kind === "video" ? ["video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) : ["audio/webm;codecs=opus", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recording = { kind, stream, recorder, chunks: [], started: performance.now(), timer: null };
      recorder.ondataavailable = (ev) => ev.data.size && recording.chunks.push(ev.data);
      recorder.onstop = finishRecording;
      recorder.start(250);
      rec = R.transition(rec, { type: "granted" });
      host.dataset.wasiRec = rec.state;
      recording.timer = setInterval(() => {
        rec = R.transition(rec, { type: "tick", seconds: (performance.now() - recording.started) / 1000 });
        host.dataset.wasiRec = rec.state;
        const el = mainEl && mainEl.querySelector(".rectime");
        if (el) el.textContent = `${rec.seconds.toFixed(1)} / ${R.MAX_SECONDS}${t("seconds")}`;
        if (rec.state === "done") stopRecording();
      }, 200);
      render();
    } catch (e) {
      rec = R.transition(rec, { type: "denied" });
      host.dataset.wasiRec = rec.state;
      setStatus("bad", "micDenied");
      render();
    }
  }

  function stopRecording() {
    if (!recording) return;
    clearInterval(recording.timer);
    if (recording.recorder.state !== "inactive") recording.recorder.stop();
    if (rec.state === "recording") rec = R.transition(rec, { type: "stop" });
    host.dataset.wasiRec = rec.state;
  }

  function finishRecording() {
    const r = recording;
    recording = null;
    r.stream.getTracks().forEach((tr) => tr.stop());
    const type = r.recorder.mimeType || (r.kind === "video" ? "video/webm" : "audio/webm");
    const name = `${r.kind === "video" ? "video" : "voice"}-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.webm`;
    const file = new File(r.chunks, name, { type: type.split(";")[0] });
    rec = R.transition(rec, { type: "reset" });
    host.dataset.wasiRec = rec.state;
    pick(file);
  }

  // ---------- building ----------
  async function startBuild() {
    if (!src) return;
    const needsSound = src.kind === "image" || src.kind === "animated" || (src.kind === "video" && !src.buffer);
    if (needsSound && !src.sound) {
      setStatus("bad", "pickSound");
      return;
    }
    dispatch({ type: "build" });
    const run = job.run;
    abort = new AbortController();
    const signal = abort.signal;
    const e = job.edit;
    setStatus("", "");
    refreshBuild();
    const progress = (base, span) => (p) => {
      if (dispatch({ type: "progress", run, value: base + p * span })) {
        const bar = mainEl && mainEl.querySelector(".progress > div");
        if (bar) bar.style.width = `${Math.round(job.progress * 100)}%`;
        const pct = mainEl && mainEl.querySelector(".buildpct");
        if (pct) pct.textContent = Math.round(job.progress * 100) + "%";
        const st = mainEl && mainEl.querySelector(".buildstage");
        if (st) st.textContent = stageText(job.progress);
      }
    };
    let frames = [];
    try {
      // 1. Sound
      const visualSeconds = (e.end - e.start) / e.speed;
      let pcm;
      if (src.sound && (src.kind === "video" || src.kind === "animated")) {
        const end = src.kind === "animated" ? Math.min(src.sound.duration, 10) : Math.min(src.sound.duration, e.end - e.start);
        pcm = await WASI.audio.render(src.sound, { start: 0, end, speed: e.speed, volume: e.volume, normalize: e.louder, fadeIn: e.fade ? 0.25 : 0, fadeOut: e.fade ? 0.4 : 0 });
      } else {
        const buf = src.sound || src.buffer;
        pcm = await WASI.audio.render(buf, { start: e.start, end: e.end, speed: e.speed, volume: e.volume, normalize: e.louder, fadeIn: e.fade ? 0.25 : 0, fadeOut: e.fade ? 0.4 : 0 });
      }
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const { ogg, seconds } = await WASI.audio.makeOgg(pcm);
      progress(0, 0.1)(1);

      // 2. Pictures
      const step = progress(0.1, 0.45);
      if (src.kind === "video") frames = await WASI.frames.fromVideo(src.video, e, { fps: WASI.builder.fpsFor(visualSeconds), signal, onProgress: step });
      else if (src.kind === "animated") frames = await WASI.frames.fromAnimated(src.file, e, { signal, onProgress: step });
      else if (src.kind === "image") frames = await WASI.frames.fromImage(src.bitmap, e, seconds * 1000);
      else frames = await WASI.frames.fromAudio(pcm, e, { fps: 12, photo: src.photo, signal, onProgress: step });
      if (e.boomerang && (src.kind === "video" || src.kind === "animated")) frames = WASI.frames.boomerang(frames);

      // 3. Sticker file
      const packed = await WASI.builder.packWebp(frames, ogg, { pack: prefs.pack, author: prefs.author, emoji: e.emoji }, signal, progress(0.55, 0.45));
      const sticker = { webp: packed.webp, ogg, seconds, side: packed.side, emoji: e.emoji };
      if (!dispatch({ type: "built", run, sticker: { size: packed.webp.length } })) return;
      freeBuilt();
      built = {
        ...sticker,
        webpUrl: URL.createObjectURL(new Blob([sticker.webp], { type: "image/webp" })),
        oggUrl: URL.createObjectURL(new Blob([sticker.ogg], { type: "audio/ogg" })),
        name: (src.file && src.file.name.replace(/\.[^.]+$/, "")) || "sticker",
        savedId: null,
      };
    } catch (err) {
      if (err && err.name === "AbortError") return;
      console.warn("[audio stickers]", err);
      if (dispatch({ type: "failed", run, message: t(errorKey(err)) })) setStatus("bad", errorKey(err));
    } finally {
      const seen = new Set();
      for (const f of frames) if (!seen.has(f.bitmap)) (seen.add(f.bitmap), f.bitmap.close && f.bitmap.close());
      if (abort && abort.signal === signal) abort = null;
      refreshBuild();
    }
  }

  function cancelBuild() {
    if (abort) abort.abort();
    abort = null;
    if (job.state === "building") dispatch({ type: "cancel" });
    refreshBuild();
  }

  // ---------- sending, saving ----------
  async function sendSticker(sticker, target) {
    const res = await WASI.wa.send(sticker, target);
    return res && res.withSound === false ? "audioStripped" : "sentOk";
  }

  async function sendBuilt(target) {
    if (!built) return;
    if (!dispatch({ type: "send" })) return;
    refreshBuild();
    try {
      const key = await sendSticker(built, target);
      dispatch({ type: "sent" });
      setStatus(key === "sentOk" ? "ok" : "info", key);
    } catch (e) {
      // The built sticker is kept, so "error" still allows Send again.
      dispatch({ type: "failed", message: t(errorKey(e)) });
      setStatus("bad", errorKey(e));
    }
    refreshBuild();
  }

  async function saveBuilt() {
    if (!built || built.savedId) return;
    const id = crypto.randomUUID();
    try {
      await WASI.store.put({
        id,
        webp: WASI.builder.b64(built.webp),
        ogg: WASI.builder.b64(built.ogg),
        side: built.side,
        seconds: built.seconds,
        emoji: built.emoji,
        name: built.name,
        fav: false,
        created: Date.now(),
      });
      built.savedId = id;
      refreshBuild();
      refreshLibrary();
    } catch (e) {
      setStatus("bad", e.message === "libraryFull" ? "libraryFull" : "sendFailed");
    }
  }

  function download(item) {
    const base = (item.name || "sticker").replace(/[^\wऀ-ॿ-]+/g, "-").slice(0, 40) || "sticker";
    for (const [bytes, ext, type] of [[item.webp, "webp", "image/webp"], [item.ogg, "ogg", "audio/ogg"]]) {
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      const a = h("a", { href: url, download: `${base}.${ext}` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  }

  // ---------- library ----------
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  let libUrls = [];

  // Outside the My stickers tab only the count is read (small and fast). The full list, with every sticker's
  // picture and sound, loads only while that tab is open. A late answer from an older request is dropped.
  async function refreshLibrary() {
    const run = ++libRun;
    if (tab !== "library") {
      let n = libCount;
      try {
        n = await WASI.store.count();
      } catch (_) {
        /* keep the old count */
      }
      if (run !== libRun) return;
      libCount = n;
      const navEl = panel.querySelector("nav");
      if (navEl) navEl.replaceWith(nav());
      return;
    }
    let list = [];
    try {
      list = await WASI.store.list();
    } catch (_) {
      list = [];
    }
    if (run !== libRun || tab !== "library") return;
    library = list.sort((a, b) => Number(b.fav) - Number(a.fav) || b.created - a.created);
    libCount = library.length;
    render();
  }

  function libraryTab() {
    libUrls.forEach((u) => URL.revokeObjectURL(u));
    libUrls = [];
    const importer = filePicker(".json,application/json", importPack);
    const top = h("div", { class: "row", style: "margin-bottom:14px" }, btn(t("exportPack"), "download", exportPack, "btn small"), btn(t("importPack"), "upload", () => importer.click(), "btn small"), importer);
    if (!library.length) return [top, h("div", { class: "empty" }, icon("save"), h("p", { text: t("libraryEmpty") })), h("div", { class: "status", "data-kind": status.kind, role: "status", text: status.text })];
    const grid = h("div", { class: "grid" });
    for (const it of library) {
      const webp = fromB64(it.webp);
      const ogg = fromB64(it.ogg);
      const url = URL.createObjectURL(new Blob([webp], { type: "image/webp" }));
      const aurl = URL.createObjectURL(new Blob([ogg], { type: "audio/ogg" }));
      libUrls.push(url, aurl);
      const audio = h("audio", { src: aurl, preload: "none" });
      const sticker = { webp, ogg, seconds: it.seconds, side: it.side, emoji: it.emoji, name: it.name };
      grid.append(
        h(
          "div",
          { class: "card" },
          h("button", { class: "thumb", type: "button", title: t("playSound"), "aria-label": `${t("playSound")}: ${it.name}`, onclick: () => ((audio.currentTime = 0), audio.play().catch(() => {})) }, h("img", { src: url, alt: "" })),
          audio,
          h(
            "div",
            { class: "acts" },
            h("button", { class: "iconbtn", type: "button", title: t("sendHere"), "aria-label": t("sendHere"), onclick: async () => {
              try {
                setStatus("ok", await sendSticker(sticker, "open"));
              } catch (e) {
                setStatus("bad", errorKey(e));
              }
            } }, icon("send")),
            h("button", { class: "iconbtn", type: "button", title: t("favourite"), "aria-label": t("favourite"), "aria-pressed": String(it.fav), onclick: async () => (await WASI.store.update(it.id, !it.fav).catch(() => {}), refreshLibrary()) }, icon("star")),
            h("button", { class: "iconbtn", type: "button", title: t("download"), "aria-label": t("download"), onclick: () => download(sticker) }, icon("download")),
            h("button", { class: "iconbtn", type: "button", title: t("remove"), "aria-label": t("remove"), onclick: async () => {
              if (!root.confirm(t("confirmRemove"))) return;
              await WASI.store.remove(it.id).catch(() => {});
              refreshLibrary();
            } }, icon("trash"))
          )
        )
      );
    }
    return [top, grid, h("div", { class: "status", "data-kind": status.kind, role: "status", "aria-live": "polite", text: status.text })];
  }

  function exportPack() {
    const pack = { format: "whatsapp-audio-stickers-india", version: 1, exported: new Date().toISOString(), stickers: library };
    const url = URL.createObjectURL(new Blob([JSON.stringify(pack)], { type: "application/json" }));
    const a = h("a", { href: url, download: `audio-stickers-pack-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function importPack(file) {
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error("too big");
      const data = JSON.parse(await file.text());
      if (!data || data.format !== "whatsapp-audio-stickers-india" || !Array.isArray(data.stickers)) throw new Error("bad");
      let n = 0;
      for (const it of data.stickers.slice(0, 60)) {
        try {
          const webp = fromB64(String(it.webp));
          if (!WASI.webp.inspect(webp).frames) continue; // only real animated stickers
          await WASI.store.put({ ...it, id: crypto.randomUUID() });
          n++;
        } catch (e) {
          if (e.message === "libraryFull") break;
        }
      }
      status = { kind: "ok", text: `${t("imported")}: ${n}` };
      refreshLibrary();
    } catch (_) {
      setStatus("bad", "unknownFile");
      render();
    }
  }

  // ---------- Help tab ----------
  function helpTab() {
    const diag = h("div", { class: "diag" });
    return [
      h("section", {}, h("h2", { text: t("helpTitle") }), h("ol", {}, ["help1", "help2", "help3", "help4"].map((k) => h("li", { text: t(k) })))),
      h("section", {}, h("h2", { text: t("safetyTitle") }), h("ul", {}, ["safety1", "safety2", "safety3", "safety4"].map((k) => h("li", { text: t(k) })))),
      h(
        "section",
        {},
        h("h2", { text: t("linksTitle") }),
        h(
          "div",
          { class: "links" },
          h("a", { href: REPO_URL, target: "_blank", rel: "noopener noreferrer" }, h("span", { class: "ico" }, icon("code")), t("linkRepo")),
          h("a", { href: SERVICES_URL, target: "_blank", rel: "noopener noreferrer" }, h("span", { class: "ico" }, icon("globe")), t("linkServices")),
          h("a", { href: WHATSAPP_URL, target: "_blank", rel: "noopener noreferrer" }, h("span", { class: "ico" }, icon("chat")), t("linkWhatsApp"))
        )
      ),
      h(
        "section",
        {},
        btn("Diagnostics", "refresh", () => (diag.textContent = JSON.stringify(WASI.wa.diagnostics(), null, 2)), "btn small"),
        diag
      ),
    ];
  }

  // ---------- cleanup ----------
  function freeOne(s) {
    if (!s) return;
    (s.previewUrls || []).forEach((u) => URL.revokeObjectURL(u));
    if (s.video) {
      s.video.pause();
      s.video.removeAttribute("src");
      s.video.load();
      s.video.remove();
    }
    s.bitmap && s.bitmap.close && s.bitmap.close();
    s.photo && s.photo.close && s.photo.close();
  }
  function freeSource() {
    stopPart();
    freeOne(src);
    src = null;
  }
  function freeBuilt() {
    if (!built) return;
    URL.revokeObjectURL(built.webpUrl);
    URL.revokeObjectURL(built.oggUrl);
    built = null;
  }

  WASI.panel = { mount, toggle, get state() { return { job, rec, tab }; } };
  WASI.onToggle = () => {
    mount();
    toggle();
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
