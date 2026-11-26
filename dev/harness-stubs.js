// Stand-ins for the parts that only exist inside WhatsApp Web and the extension, for local testing.
(function () {
  const WASI = window.WASI;
  const mem = { library: [], prefs: {} };
  WASI.store = {
    list: async () => mem.library.slice(),
    put: async (item) => {
      if (mem.library.length >= 60) throw new Error("libraryFull");
      mem.library = mem.library.filter((x) => x.id !== item.id);
      mem.library.unshift(item);
      return true;
    },
    update: async (id, fav) => {
      const it = mem.library.find((x) => x.id === id);
      if (it) it.fav = fav;
      return true;
    },
    remove: async (id) => ((mem.library = mem.library.filter((x) => x.id !== id)), true),
    getPrefs: async () => ({ ...mem.prefs }),
    setPrefs: async (p) => (Object.assign(mem.prefs, p), true),
    pageReady: () => {},
    brand: async () => ({ buf: await (await fetch("../extension/icons/symbol-96.png")).arrayBuffer() }),
    fonts: async () => [
      { buf: await (await fetch("../extension/fonts/baloo-2-latin-wght-normal.woff2")).arrayBuffer(), range: "U+0000-00FF,U+2000-206F" },
      { buf: await (await fetch("../extension/fonts/baloo-2-devanagari-wght-normal.woff2")).arrayBuffer(), range: "U+0900-097F,U+200C-200D,U+20B9,U+25CC" },
    ],
  };
  const realSend = WASI.wa.send;
  WASI.wa.keepSoundStickersOn = () => {};
  WASI.wa.send = async (sticker, target) => {
    await new Promise((r) => setTimeout(r, 700));
    // Show it like a sent sticker: no bubble, a small sound label and the time with ticks under it.
    const wrap = document.createElement("div");
    wrap.className = "sticker";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(new Blob([sticker.webp], { type: "image/webp" }));
    img.alt = "";
    const meta = document.createElement("div");
    meta.className = "meta";
    const snd = document.createElement("span");
    snd.className = "snd";
    // muted speaker, like WhatsApp shows before you tap a sound sticker
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of ["M4 9.5h3.5L12 5.5v13l-4.5-4H4z", "M16 9.5l5 5", "M21 9.5l-5 5"]) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    }
    snd.appendChild(svg);
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = "9:4" + Math.min(9, 2 + document.querySelectorAll(".sticker").length) + " PM";
    meta.append(t);
    wrap.append(img, snd, meta);
    const msgs = document.getElementById("msgs");
    msgs.append(wrap);
    // Keep the newest messages in view: drop the oldest (after the day label) while the top one is cut off.
    const top = () => msgs.children[1] && msgs.children[1].getBoundingClientRect().top < msgs.getBoundingClientRect().top + 8;
    while (top() && msgs.children.length > 3) msgs.children[1].remove();
    window.__lastSent = sticker;
    return { ok: true, withSound: true };
  };
  WASI.wa.realSend = realSend;
  window.__harness = mem;
})();
