// Bridge (isolated world). The only script with chrome.* access inside WhatsApp Web.
// It does two things:
// 1. Passes "toggle panel" from the toolbar button to the page.
// 2. Keeps "My stickers" and settings in chrome.storage.local (private to this extension, on this computer).
// It never makes network requests and only answers a short, fixed list of requests.

(() => {
  "use strict";
  const TAG = "__wasi_india__";
  const LIB_KEY = "library";
  const PREFS_KEY = "prefs";
  const MAX_ITEMS = 60;
  const MAX_ITEM_CHARS = 3000000; // base64 of a 1 MB sticker plus a 1 MB sound fits under this
  const FONTS = [
    ["baloo-2-latin-wght-normal.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
    ["baloo-2-devanagari-wght-normal.woff2", "U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF"],
  ];
  const PREF_KEYS =["lang", "pack", "author", "emoji", "fit", "textPos"];

  function toPage(msg) {
    window.postMessage({ [TAG]: true, dir: "toPage", ...msg }, location.origin);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "toggle") toPage({ op: "toggle" });
  });

  const get = (k) => chrome.storage.local.get(k).then((r) => r[k]);
  const set = (k, v) => chrome.storage.local.set({ [k]: v });

  function cleanItem(it) {
    if (!it || typeof it !== "object") throw new Error("bad item");
    const id = String(it.id || "").slice(0, 64);
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error("bad id");
    const webp = String(it.webp || "");
    const ogg = String(it.ogg || "");
    if (!/^[A-Za-z0-9+/=]+$/.test(webp) || !/^[A-Za-z0-9+/=]+$/.test(ogg)) throw new Error("bad data");
    if (webp.length + ogg.length > MAX_ITEM_CHARS) throw new Error("too big");
    return {
      id,
      webp,
      ogg,
      side: Math.max(64, Math.min(512, Number(it.side) || 512)),
      seconds: Math.max(0, Math.min(60, Number(it.seconds) || 0)),
      emoji: String(it.emoji || "🔊").slice(0, 8),
      name: String(it.name || "").slice(0, 80),
      fav: Boolean(it.fav),
      created: Number(it.created) || Date.now(),
    };
  }

  const ops = {
    async "lib.list"() {
      return (await get(LIB_KEY)) || [];
    },
    async "lib.put"({ item }) {
      const clean = cleanItem(item);
      const list = ((await get(LIB_KEY)) || []).filter((x) => x.id !== clean.id);
      if (list.length >= MAX_ITEMS) throw new Error("libraryFull");
      list.unshift(clean);
      await set(LIB_KEY, list);
      return true;
    },
    async "lib.update"({ id, fav }) {
      const list = (await get(LIB_KEY)) || [];
      const it = list.find((x) => x.id === id);
      if (it) it.fav = Boolean(fav);
      await set(LIB_KEY, list);
      return true;
    },
    async "lib.delete"({ id }) {
      const list = ((await get(LIB_KEY)) || []).filter((x) => x.id !== id);
      await set(LIB_KEY, list);
      return true;
    },
    // Our bundled Baloo 2 font files, handed to the page as bytes (WhatsApp's page rules block font URLs).
    async "fonts.get"() {
      const out = [];
      for (const [file, range] of FONTS) {
        const res = await fetch(chrome.runtime.getURL("fonts/" + file));
        out.push({ buf: await res.arrayBuffer(), range });
      }
      return out;
    },
    // The logo symbol as bytes, for the panel header (same reason as the fonts).
    async "brand.get"() {
      const res = await fetch(chrome.runtime.getURL("icons/symbol-96.png"));
      return { buf: await res.arrayBuffer() };
    },
    async "prefs.get"() {
      return (await get(PREFS_KEY)) || {};
    },
    async "prefs.set"({ prefs }) {
      const now = (await get(PREFS_KEY)) || {};
      for (const k of PREF_KEYS) if (prefs && k in prefs) now[k] = String(prefs[k]).slice(0, 128);
      await set(PREFS_KEY, now);
      return true;
    },
  };

  window.addEventListener("message", async (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const d = ev.data;
    if (!d || d[TAG] !== true || d.dir !== "toBridge") return;
    if (d.op === "ready") {
      chrome.runtime.sendMessage({ type: "pageReady" }).catch(() => {});
      return;
    }
    const fn = Object.prototype.hasOwnProperty.call(ops, d.op) ? ops[d.op] : null;
    if (!fn) return;
    try {
      toPage({ id: d.id, ok: true, result: await fn(d) });
    } catch (e) {
      toPage({ id: d.id, ok: false, error: String((e && e.message) || e).slice(0, 80) });
    }
  });
})();
