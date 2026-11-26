// Our own line icons (24 px grid, 1.8 stroke). Built with createElementNS, so they work under
// WhatsApp Web's Trusted Types rules.
(function (root) {
  "use strict";
  const WASI = (root.WASI = root.WASI || {});
  const NS = "http://www.w3.org/2000/svg";
  const P = {
    sound: ["M4 9.5h3.5L12 5.5v13l-4.5-4H4z", "M15.5 9a4 4 0 0 1 0 6", "M18.5 6.5a7.5 7.5 0 0 1 0 11"],
    close: ["M6 6l12 12", "M18 6L6 18"],
    upload: ["M12 15V4", "M7.5 8.5L12 4l4.5 4.5", "M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"],
    mic: ["M12 3.5a3 3 0 0 1 3 3V12a3 3 0 0 1-6 0V6.5a3 3 0 0 1 3-3z", "M6 11.5a6 6 0 0 0 12 0", "M12 17.5V21"],
    video: ["M4.5 7h9A1.5 1.5 0 0 1 15 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 15.5v-7A1.5 1.5 0 0 1 4.5 7z", "M15 10.5l5.5-3v9l-5.5-3"],
    image: ["M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5z", "M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5", "M15.5 9.2a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6z"],
    send: ["M4 12l16-7.5-6 16-2.5-6.5z", "M11.5 14l3.5-4"],
    user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4.5 20a7.5 7.5 0 0 1 15 0"],
    save: ["M6.5 3.5h11A1.5 1.5 0 0 1 19 5v15.5l-7-4.5-7 4.5V5a1.5 1.5 0 0 1 1.5-1.5z"],
    download: ["M12 4v11", "M7.5 10.5L12 15l4.5-4.5", "M5 19.5h14"],
    star: ["M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6-4.1-3.9 5.6-.7z"],
    trash: ["M4.5 7h15", "M9.5 7V4.5h5V7", "M6.5 7l1 13h9l1-13", "M10 11v5.5", "M14 11v5.5"],
    play: ["M7.5 5v14l11.5-7z"],
    stop: ["M7 7h10v10H7z"],
    help: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6", "M12 17.2v.1"],
    globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M3 12h18", "M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3z"],
    chat: ["M4 18.5l1.2-3.6A8 8 0 1 1 8.6 18z", "M9 10.5h6", "M9 13.5h4"],
    code: ["M8.5 7.5L4 12l4.5 4.5", "M15.5 7.5L20 12l-4.5 4.5", "M13.5 5l-3 14"],
    refresh: ["M19.5 12a7.5 7.5 0 1 1-2.2-5.3", "M19.5 4.5v4h-4"],
  };

  function icon(name) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const d of P[name] || []) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    }
    return svg;
  }

  // Placeholder brand mark until the designer's logo lands: a lime die-cut sticker with a peeled corner,
  // ink outline and hard shadow, holding a speaker with two sound waves.
  function mark() {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "mark");
    const sticker = "M14 4h20a10 10 0 0 1 10 10v12L26 44H14A10 10 0 0 1 4 34V14A10 10 0 0 1 14 4z";
    const parts = [
      ["path", { d: sticker, transform: "translate(2 2)", fill: "#080808" }],
      ["path", { d: sticker, fill: "#d6ff36", stroke: "#080808", "stroke-width": 2.5, "stroke-linejoin": "round" }],
      ["path", { d: "M44 26h-9a9 9 0 0 0-9 9v9z", fill: "#c8f21f", stroke: "#080808", "stroke-width": 2.5, "stroke-linejoin": "round" }],
      ["path", { d: "M10.5 19.5h4.5l6-5v17.5l-6-5h-4.5z", fill: "#080808", stroke: "#080808", "stroke-width": 1.5, "stroke-linejoin": "round" }],
      ["path", { d: "M25.5 18.5a6.5 6.5 0 0 1 0 9.5", stroke: "#080808", "stroke-width": 3, fill: "none", "stroke-linecap": "round" }],
      ["path", { d: "M30 14.5a12 12 0 0 1 2.5 9", stroke: "#080808", "stroke-width": 3, fill: "none", "stroke-linecap": "round" }],
    ];
    for (const [tag, attrs] of parts) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      svg.appendChild(el);
    }
    return svg;
  }

  WASI.icons = { icon, mark };
})(typeof globalThis !== "undefined" ? globalThis : this);
