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
    launcher = h("button", { class: "launcher", type: "button", title: t("launcher"), "aria-label": t("launcher"), onclick: toggle }, icon("sound"));
    panel = h("div", { class: "panel", role: "dialog", "aria-label": t("title"), hidden: true });
    wrap.append(launcher, panel);
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
      })
      .catch(() => {}); // the drawn placeholder mark stays
    WASI.store
      .getPrefs()
      .then((p) => {
        prefs = { ...prefs, ...p };
        WASI.i18n.setLang(prefs.lang);
        render();
      })
      .catch(() => render());
    render();
  }

  function applyTheme() {
    const dark = (document.body && document.body.classList.contains("dark")) || root.matchMedia("(prefers-color-scheme: dark)").matches;
    shadow.querySelector(".wasi").dataset.theme = dark ? "dark" : "light";
  }

  function toggle(force) {
    open = typeof force === "boolean" ? force : !open;
    panel.hidden = !open;
    launcher.hidden = open;
    if (open) {
      refreshLibrary();
      const first = panel.querySelector("button, input");
      first && first.focus();
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
    launcher.title = t("launcher");
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
          id === "library" && library.length ? h("span", { class: "count", text: String(library.length) }) : null
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
        ondrop: (e) => {
          e.preventDefault();
          drop.dataset.over = "false";
          const f = e.dataTransfer.files[0];
          f && pick(f);
        },
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
      h("div", { class: "row" }, h("span", { class: "filename", style: "flex:1", text: s.file ? s.file.name : "" }), btn(t("chooseFile"), "upload", resetToPick, "btn small")),
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

  function editSection() {
    const e = job.edit;
    const dur = (job.clip && job.clip.duration) || 0;
    const fmt = (v) => `${v.toFixed(1)}${t("seconds")}`;
    const lengthEl = h("span", { class: "length" });
    const showLength = () => (lengthEl.textContent = `${t("length")}: ${fmt((job.edit.end - job.edit.start) / job.edit.speed)} / ${J.MAX_SECONDS}${t("seconds")}`);
    showLength();

    function slider(key, label) {
      const out = h("span", { text: fmt(e[key]) });
      const input = h("input", { type: "range", min: "0", max: String(dur), step: "0.05", value: String(e[key]), "aria-label": label });
      input.addEventListener("input", () => {
        const v = Number(input.value);
        const patch = { [key]: v };
        // keep the window under the max length by moving the other handle
        if (key === "start" && job.edit.end - v > J.MAX_SECONDS) patch.end = v + J.MAX_SECONDS;
        if (key === "end" && v - job.edit.start > J.MAX_SECONDS) patch.start = v - J.MAX_SECONDS;
        if (key === "end" && v < job.edit.start) patch.start = v;
        if (key === "start" && v > job.edit.end) patch.end = v;
        dispatch({ type: "edit", edit: patch });
        out.textContent = fmt(job.edit[key]);
        const other = key === "start" ? "end" : "start";
        const o = mainEl.querySelector(`input[data-k="${other}"]`);
        if (o) {
          o.value = String(job.edit[other]);
          o.parentElement.lastChild.textContent = fmt(job.edit[other]);
        }
        if (src && src.kind === "video") src.video.currentTime = job.edit[key];
        showLength();
        afterEdit();
      });
      input.dataset.k = key;
      return h("div", { class: "trim" }, h("span", { class: "label", text: label }), input, out);
    }

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
      dur > 0 && src.kind !== "animated" ? h("div", { class: "field" }, slider("start", t("start")), slider("end", t("end")), lengthEl) : null,
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
      sec.append(
        h("p", { class: "length", text: J.LABELS.building[WASI.i18n.lang] || J.LABELS.building.en }),
        bar,
        h("div", { class: "row", style: "margin-top:10px" }, btn(t("cancel"), "close", cancelBuild))
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
          btn(t("download"), "download", () => download(built), "btn small"))
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

  async function refreshLibrary() {
    try {
      library = await WASI.store.list();
    } catch (_) {
      library = [];
    }
    library.sort((a, b) => Number(b.fav) - Number(a.fav) || b.created - a.created);
    if (tab === "library") render();
    else {
      const navEl = panel.querySelector("nav");
      navEl && navEl.replaceWith(nav());
    }
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
