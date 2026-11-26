// Talks to bridge.js (isolated world) to keep "My stickers" and settings in the extension's own storage.
(function (root) {
  "use strict";
  const WASI = (root.WASI = root.WASI || {});
  const TAG = "__wasi_india__";
  const waiting = new Map();
  let nextId = 1;

  root.addEventListener("message", (ev) => {
    if (ev.source !== root || ev.origin !== root.location.origin) return;
    const d = ev.data;
    if (!d || d[TAG] !== true || d.dir !== "toPage") return;
    if (d.op === "toggle") {
      WASI.onToggle && WASI.onToggle();
      return;
    }
    const w = waiting.get(d.id);
    if (!w) return;
    waiting.delete(d.id);
    clearTimeout(w.timer);
    d.ok ? w.resolve(d.result) : w.reject(new Error(d.error || "storage"));
  });

  function req(op, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error("storage"));
      }, 8000);
      waiting.set(id, { resolve, reject, timer });
      root.postMessage({ [TAG]: true, dir: "toBridge", op, id, ...payload }, root.location.origin);
    });
  }

  WASI.store = {
    list: () => req("lib.list"),
    put: (item) => req("lib.put", { item }),
    update: (id, fav) => req("lib.update", { id, fav }),
    remove: (id) => req("lib.delete", { id }),
    getPrefs: () => req("prefs.get"),
    setPrefs: (prefs) => req("prefs.set", { prefs }),
    fonts: () => req("fonts.get"),
    brand: () => req("brand.get"),
    pageReady: () => root.postMessage({ [TAG]: true, dir: "toBridge", op: "ready" }, root.location.origin),
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
