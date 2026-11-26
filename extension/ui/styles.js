// Panel styles, inside the panel's Shadow DOM so WhatsApp's styles and ours never mix.
// Worklancio brand family (same as LabelzyKit): Electric Lime + ink, Baloo 2, hard ink shadows for brand
// moments (primary button, launcher), soft surfaces for working areas, olive-black dark theme.
(function (root) {
  "use strict";
  const WASI = (root.WASI = root.WASI || {});
  WASI.css = `
:host { all: initial; }
.wasi {
  --lime: #d6ff36; --lime-hover: #c8f21f; --lime-ink: #4a5c00; --ink-fixed: #080808;
  --bg: #fafaf7; --surface: #ffffff; --surface-2: #f5f5f2; --line: #e0e0dc; --line-strong: #c9c9c4;
  --text: #080808; --muted: #57574f; --soft-lime: #f4ffd0; --shadow-color: #080808; --brut-border: #080808;
  --success: #15803d; --success-soft: #e3f5e8; --danger: #c62828; --danger-soft: #fdeaea; --info-soft: #f5f5f2;
  --shadow-lift: 0 2px 4px rgb(8 8 8 / 0.05), 0 12px 32px rgb(8 8 8 / 0.12);
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --font: "Baloo 2", system-ui, -apple-system, "Segoe UI", "Nirmala UI", sans-serif;
  font: 450 14px/1.5 var(--font);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
.wasi[data-theme="dark"] {
  --bg: #0d0f0a; --surface: #16190f; --surface-2: #1d2115; --line: #2b3020; --line-strong: #3d4430;
  --text: #f4f7ea; --muted: #a9ae9c; --soft-lime: #232b0b; --shadow-color: #000000; --brut-border: #3d4430;
  --success: #4ade80; --success-soft: #11291a; --danger: #f87171; --danger-soft: #331414; --info-soft: #1d2115;
  --lime-ink: #d6ff36; --shadow-lift: 0 12px 40px rgb(0 0 0 / 0.55);
}
.wasi *, .wasi *::before, .wasi *::after { box-sizing: border-box; }
.wasi ::selection { background: var(--lime); color: var(--ink-fixed); }
.wasi :focus-visible { outline: 3px solid var(--lime); outline-offset: 2px; box-shadow: 0 0 0 5px var(--ink-fixed); border-radius: 8px; }
.wasi button, .wasi input { font-family: var(--font); }

/* Handle: one lime tab that rides with the panel. Closed: on the right edge. Open: on the panel's left edge.
   Click to open or close, drag up or down to move it (position is remembered). */
.handle {
  /* Moves with transform only (GPU), never with right/width, so it stays smooth while WhatsApp is busy. */
  --hx: 0px; --hv: 0px;
  position: fixed; z-index: 2147483002; right: 0; top: var(--hy, 42%); transform: translate3d(calc(var(--hx) + var(--hv)), -50%, 0);
  will-change: transform;
  display: grid; justify-items: center; gap: 7px; width: 50px; padding: 11px 0 9px;
  border: 2px solid var(--ink-fixed); border-right: 0; border-radius: 18px 0 0 18px;
  background: var(--lime); color: var(--ink-fixed); cursor: pointer; touch-action: none; user-select: none;
  box-shadow: -4px 4px 0 0 var(--ink-fixed);
  transition: transform 280ms var(--ease), background 160ms var(--ease), box-shadow 180ms var(--ease);
}
.handle:hover { --hv: -4px; background: var(--lime-hover); box-shadow: -5px 5px 0 0 var(--ink-fixed); }
.handle:active { box-shadow: -2px 2px 0 0 var(--ink-fixed); }
.handle.dragging { cursor: grabbing; transition: none; box-shadow: -6px 8px 0 0 var(--ink-fixed); }
.handle.is-open { --hx: calc(-1 * min(424px, calc(100vw - 50px))); }
.handle-logo { display: grid; place-items: center; width: 32px; height: 32px; }
.handle-logo img { width: 32px; height: 32px; display: block; -webkit-user-drag: none; pointer-events: none; filter: drop-shadow(1px 1px 0 rgb(8 8 8 / .25)); }
.handle-logo svg { width: 24px; height: 24px; stroke-width: 2.2; }
.handle-waves { display: flex; align-items: center; gap: 3px; height: 14px; }
.handle-waves i { display: block; width: 3px; height: 100%; border-radius: 3px; background: var(--ink-fixed); transform: scaleY(.35); }
.handle-waves i:nth-child(2) { transform: scaleY(.7); }
.handle-waves i:nth-child(3) { transform: scaleY(.5); }
.handle:hover .handle-waves i, :host([data-wasi-state=building]) .handle-waves i { animation: wasi-wave 820ms ease-in-out infinite; }
.handle-waves i:nth-child(2) { animation-delay: -200ms; }
.handle-waves i:nth-child(3) { animation-delay: -420ms; }
.handle-waves i:nth-child(4) { animation-delay: -620ms; }
@keyframes wasi-wave { 0%, 100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }
.handle-chev { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--ink-fixed); color: var(--lime); }
.handle-chev svg { width: 15px; height: 15px; stroke-width: 2.6; transition: transform 280ms var(--ease); }
.handle.is-open .handle-chev svg { transform: rotate(180deg); }
.handle-grip { width: 16px; height: 6px; opacity: .45; background-image: radial-gradient(var(--ink-fixed) 1.1px, transparent 1.3px); background-size: 4px 3px; }
.wasi[data-theme=dark] .handle { box-shadow: -4px 4px 0 0 #000; }

.panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483001; width: min(424px, 100vw);
  display: flex; flex-direction: column; background: var(--bg); border-left: 2px solid var(--brut-border);
  box-shadow: var(--shadow-lift); transition: transform 280ms var(--ease), visibility 0s linear 0s;
  will-change: transform; contain: layout paint style;
}
.panel[hidden] { display: flex; transform: translate3d(105%, 0, 0); visibility: hidden; transition: transform 280ms var(--ease), visibility 0s linear 280ms; }

/* Header with the dot grid LabelzyKit uses for brand areas */
header {
  display: flex; align-items: center; gap: 10px; padding: 14px 16px 12px;
  background-image: radial-gradient(color-mix(in srgb, var(--text) 13%, transparent) 1px, transparent 1px);
  background-size: 18px 18px;
}
.mark { width: 44px; height: 44px; flex: none; margin: -4px -2px -4px -4px; }
.titles { flex: 1; min-width: 0; }
h1 { margin: 0; font-size: 20px; line-height: 1.08; font-weight: 800; letter-spacing: -0.02em; }
h1 .tag { margin-left: 6px; vertical-align: 3px; }
.tag {
  display: inline-block; padding: 1px 7px 0; border: 2px solid var(--ink-fixed); border-radius: 7px;
  /* Tricolour tag, as in the logo: saffron, white, green bands with ink letters */
  background: linear-gradient(#ff9933 0 30%, #ffffff 30% 70%, #138808 70%); color: var(--ink-fixed);
  font-size: 11px; font-weight: 800; letter-spacing: 0.04em; line-height: 1.4;
}
.tagline { margin: 3px 0 0; color: var(--muted); font-size: 12.5px; font-weight: 500; }
.iconbtn {
  display: grid; place-items: center; width: 36px; height: 36px; border: 1.5px solid transparent; border-radius: 10px;
  background: transparent; color: var(--text); cursor: pointer; transition: background 160ms var(--ease);
}
.iconbtn:hover { background: var(--surface-2); }
.iconbtn svg { width: 19px; height: 19px; }
.lang { display: flex; padding: 3px; gap: 2px; border: 1.5px solid var(--line-strong); border-radius: 999px; background: var(--surface); }
.lang button { border: 0; min-width: 34px; padding: 3px 9px 1px; border-radius: 999px; background: transparent; color: var(--muted); font-size: 13px; font-weight: 700; cursor: pointer; }
.lang button[aria-pressed="true"] { background: var(--lime); color: var(--ink-fixed); }

nav { display: flex; gap: 6px; padding: 4px 14px 12px; border-bottom: 1.5px solid var(--line); }
nav button {
  border: 1.5px solid transparent; padding: 6px 13px 4px; border-radius: 999px; background: transparent; color: var(--muted);
  font-size: 14px; font-weight: 700; cursor: pointer; transition: background 160ms var(--ease), color 160ms var(--ease);
}
nav button:hover { color: var(--text); background: var(--surface-2); }
nav button[aria-selected="true"] { color: var(--ink-fixed); background: var(--lime); border-color: var(--ink-fixed); }
nav .count {
  margin-left: 5px; padding: 0 6px; border-radius: 999px; background: var(--ink-fixed); color: var(--lime);
  font-size: 11px; font-variant-numeric: tabular-nums;
}

main { flex: 1; overflow-y: auto; padding: 18px 16px 20px; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
section + section { margin-top: 24px; }
h2 { margin: 0 0 10px; font-size: 16px; font-weight: 800; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; }
h2 .step {
  display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 999px;
  background: var(--ink-fixed); color: var(--lime); font-size: 12px; font-weight: 800;
}
.wasi[data-theme="dark"] h2 .step { background: var(--lime); color: var(--ink-fixed); }

.drop {
  display: grid; justify-items: center; gap: 6px; padding: 26px 18px 22px; text-align: center;
  border: 2px dashed var(--line-strong); border-radius: 20px; background: var(--surface); cursor: pointer;
  transition: border-color 160ms var(--ease), background 160ms var(--ease);
}
.drop:hover, .drop[data-over="true"] { border-color: var(--text); background: var(--soft-lime); }
.drop .bubble {
  display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: 4px; border: 2px solid var(--ink-fixed);
  border-radius: 16px; background: var(--lime); color: var(--ink-fixed); box-shadow: 3px 3px 0 0 var(--ink-fixed);
}
.drop .bubble svg { width: 26px; height: 26px; stroke-width: 2.2; }
.drop strong { font-size: 16px; font-weight: 800; line-height: 1.25; }
.drop p { margin: 0; color: var(--muted); font-size: 13px; max-width: 32ch; }

.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.row + .row { margin-top: 10px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 42px; padding: 8px 15px 6px;
  border: 1.5px solid var(--line-strong); border-radius: 12px; background: var(--surface); color: var(--text);
  font-size: 14px; font-weight: 700; cursor: pointer; user-select: none;
  transition: transform 160ms var(--ease), box-shadow 160ms var(--ease), background 160ms var(--ease), border-color 160ms var(--ease);
}
.btn:hover:not([disabled]) { border-color: var(--text); }
.btn[disabled] { opacity: 0.5; cursor: not-allowed; }
.btn svg { width: 18px; height: 18px; flex: none; margin-top: -2px; }
.btn.primary { background: var(--lime); color: var(--ink-fixed); border: 2px solid var(--ink-fixed); box-shadow: 3px 3px 0 0 var(--ink-fixed); }
.btn.primary:hover:not([disabled]) { background: var(--lime-hover); transform: translate(-1px, -1px); box-shadow: 4px 4px 0 0 var(--ink-fixed); }
.btn.primary:active:not([disabled]) { transform: translate(2px, 2px); box-shadow: 1px 1px 0 0 var(--ink-fixed); }
.wasi[data-theme="dark"] .btn.primary { box-shadow: 3px 3px 0 0 #000; }
.btn.wide { flex: 1; min-height: 50px; font-size: 16px; }
.btn.small { min-height: 34px; padding: 5px 11px 3px; font-size: 13px; border-radius: 10px; }
.btn.small svg { width: 16px; height: 16px; }

.preview {
  position: relative; display: grid; place-items: center; aspect-ratio: 1 / 1; width: 100%; max-width: 250px;
  margin: 0 auto 12px; border: 2px solid var(--brut-border); border-radius: 22px; overflow: hidden;
  background: var(--surface-2) repeating-conic-gradient(var(--surface-2) 0 25%, var(--surface) 0 50%) 0 0 / 18px 18px;
}
.preview video, .preview img, .preview canvas { width: 100%; height: 100%; object-fit: contain; }
.filename { color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.field { display: grid; gap: 7px; }
.field + .field { margin-top: 16px; }
.field > label, .label { font-size: 13px; font-weight: 700; color: var(--text); }
.trim { display: grid; grid-template-columns: 44px 1fr 50px; gap: 8px; align-items: center; }
.trim .label { font-weight: 600; color: var(--muted); }
.trim span:last-child { text-align: right; font-variant-numeric: tabular-nums; color: var(--text); font-weight: 700; font-size: 13px; }
input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; background: transparent; cursor: pointer; }
input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 99px; background: var(--line-strong); }
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 20px; height: 20px; margin-top: -7px; border-radius: 50%;
  background: var(--lime); border: 2px solid var(--ink-fixed); box-shadow: 1.5px 1.5px 0 0 var(--ink-fixed);
}
input[type="text"] {
  width: 100%; min-height: 42px; padding: 8px 12px 6px; border: 1.5px solid var(--line-strong); border-radius: 12px;
  background: var(--surface); color: var(--text); font-size: 15px; font-weight: 500;
}
input[type="text"]:focus { border-color: var(--text); outline: none; box-shadow: 0 0 0 3px var(--lime); }
input[type="text"]::placeholder { color: var(--muted); opacity: 1; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  min-height: 34px; padding: 4px 12px 2px; border: 1.5px solid var(--line-strong); border-radius: 999px; background: var(--surface);
  color: var(--text); font-size: 14px; font-weight: 600; cursor: pointer; transition: background 160ms var(--ease), border-color 160ms var(--ease);
}
.chip:hover { border-color: var(--text); }
.chip[aria-pressed="true"] { border: 2px solid var(--ink-fixed); background: var(--lime); color: var(--ink-fixed); font-weight: 800; }
.chips.emoji .chip { min-width: 40px; padding: 2px 6px 0; font-size: 18px; }
.check { display: flex; gap: 10px; align-items: center; min-height: 34px; cursor: pointer; font-weight: 600; }
.check input { width: 18px; height: 18px; accent-color: #b8e000; }
details { border: 1.5px solid var(--line); border-radius: 14px; padding: 10px 14px 8px; background: var(--surface); }
details summary { cursor: pointer; font-size: 14px; font-weight: 700; }
details[open] summary { margin-bottom: 10px; }
.length { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 13px; font-weight: 600; }

.progress { height: 12px; border: 2px solid var(--ink-fixed); border-radius: 99px; background: var(--surface); overflow: hidden; }
.progress > div { height: 100%; width: 0; background: var(--lime); transition: width 160ms linear; }
.meters { display: grid; gap: 8px; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--surface); }
.meter { display: grid; grid-template-columns: 58px 1fr auto; gap: 8px; align-items: center; font-size: 13px; font-weight: 600; }
.meter .bar { height: 8px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.meter .bar > div { height: 100%; background: var(--success); border-radius: 99px; }
.meter span:last-child { white-space: nowrap; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }

.status { margin-top: 14px; padding: 11px 14px 9px; border-radius: 14px; font-size: 14px; font-weight: 600; border: 1.5px solid transparent; }
.status:empty { display: none; }
.status[data-kind="ok"] { background: var(--success-soft); color: var(--success); border-color: color-mix(in srgb, var(--success) 35%, transparent); }
.status[data-kind="bad"] { background: var(--danger-soft); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
.status[data-kind="info"] { background: var(--soft-lime); color: var(--text); border-color: var(--line-strong); }

.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.card { display: grid; gap: 6px; padding: 6px; border: 1.5px solid var(--line); border-radius: 16px; background: var(--surface); transition: border-color 160ms var(--ease); }
.card:hover { border-color: var(--text); }
.card .thumb { aspect-ratio: 1 / 1; width: 100%; border: 0; padding: 0; border-radius: 11px; background: var(--surface-2); cursor: pointer; overflow: hidden; }
.card .thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
.card .acts { display: flex; justify-content: space-between; }
.card .acts .iconbtn { width: 28px; height: 28px; border-radius: 8px; }
.card .acts .iconbtn svg { width: 15px; height: 15px; }
.card .iconbtn[aria-pressed="true"] { background: var(--lime); color: var(--ink-fixed); }
.empty { display: grid; justify-items: center; gap: 8px; padding: 34px 16px; text-align: center; color: var(--muted); border: 2px dashed var(--line-strong); border-radius: 20px; }
.empty svg { width: 36px; height: 36px; color: var(--text); }
.empty p { margin: 0; max-width: 30ch; }

ol, ul { margin: 0; padding-left: 20px; }
li { padding-left: 2px; }
li + li { margin-top: 6px; }
li::marker { color: var(--muted); font-weight: 700; }
.links { display: grid; gap: 8px; }
.links a {
  display: flex; align-items: center; gap: 11px; padding: 11px 14px 9px; border: 1.5px solid var(--line-strong); border-radius: 14px;
  background: var(--surface); color: var(--text); text-decoration: none; font-weight: 700; transition: border-color 160ms var(--ease), background 160ms var(--ease);
}
.links a:hover { border-color: var(--text); background: var(--soft-lime); }
.links a .ico { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--lime); color: var(--ink-fixed); flex: none; border: 1.5px solid var(--ink-fixed); }
.links svg { width: 17px; height: 17px; }
.diag { margin-top: 10px; font: 12px/1.45 ui-monospace, Consolas, monospace; white-space: pre-wrap; color: var(--muted); }

footer { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 11px 16px 10px; border-top: 1.5px solid var(--line); font-size: 13px; font-weight: 600; color: var(--muted); }
footer a { color: var(--text); font-weight: 800; text-decoration: underline; text-decoration-color: var(--lime-ink); text-decoration-thickness: 2px; text-underline-offset: 3px; }
.wasi[data-theme="dark"] footer a { text-decoration-color: var(--lime); }

.recbox { display: grid; gap: 12px; justify-items: center; padding: 18px; border: 2px solid var(--brut-border); border-radius: 20px; background: var(--surface); }
.recdot { width: 12px; height: 12px; border-radius: 50%; background: var(--danger); animation: pulse 1s ease-in-out infinite; }
.rectime { font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; }
@keyframes pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .handle-waves i { animation: none !important; } .handle-chev svg, .panel, .handle, .progress > div, .btn { transition: none; } .recdot { animation: none; } }
`;
})(typeof globalThis !== "undefined" ? globalThis : this);
