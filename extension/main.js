// Start-up inside WhatsApp Web (MAIN world): keep sound stickers playable, add the panel, tell the bridge we are ready.
(function (root) {
  "use strict";
  const WASI = root.WASI;
  if (!WASI || WASI.started) return;
  WASI.started = true;

  WASI.wa.keepSoundStickersOn();

  function start() {
    WASI.panel.mount();
    WASI.store.pageReady();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})(globalThis);
