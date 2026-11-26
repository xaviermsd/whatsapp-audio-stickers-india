// WhatsApp Web side: find WhatsApp's own modules, turn on sound stickers for this page, and send.
// Runs in the page (MAIN world). Uses only WhatsApp's own upload and send code, so the sticker goes
// through WhatsApp's normal end-to-end encryption. We never build or read messages ourselves.
//
// Safety limits built in:
// - Sends only when the person clicks Send, to the chat that is open or to their own "You" chat.
// - One send at a time, with a 3 second gap between sends. No lists of chats, no scheduling, no bulk.

(function (root) {
  "use strict";
  const WASI = (root.WASI = root.WASI || {});
  const COOLDOWN_MS = 3000;
  const SOUND_PROPS = ["sound_stickers_creation_enabled", "sound_stickers_consumption_enabled", "sound_stickers_audio_playing_enabled"];
  let lastSend = 0;
  let busy = false;

  function mod(name) {
    try {
      if (typeof root.importNamespace === "function") {
        const m = root.importNamespace(name);
        if (m) return m;
      }
    } catch (_) {
      /* try require */
    }
    try {
      if (typeof root.require === "function") return root.require(name);
    } catch (_) {
      /* not loaded */
    }
    return null;
  }
  const def = (m) => (m && m.default) || m;

  function loaderReady() {
    return typeof root.require === "function" && typeof root.__d === "function";
  }

  function isReady() {
    if (!loaderReady()) return false;
    const c = mod("WAWebChatCollection");
    return Boolean(c && c.ChatCollection);
  }

  // Turns the three sound sticker switches on for this page only. Changes nothing on the account or server.
  function enableSoundStickers() {
    if (!loaderReady()) return false;
    let changed = false;
    const ab = mod("WAWebABProps");
    if (ab && typeof ab.getABPropConfigValue === "function" && !ab.getABPropConfigValue.__wasi) {
      const original = ab.getABPropConfigValue;
      const wrapped = function (name) {
        if (SOUND_PROPS.includes(name)) return true;
        return original.apply(this, arguments);
      };
      wrapped.__wasi = true;
      try {
        ab.getABPropConfigValue = wrapped;
        changed = true;
      } catch (_) {
        /* read-only in this build */
      }
    }
    const gate = mod("WAWebSoundStickerGating");
    if (gate) {
      for (const fn of ["isSoundStickerCreationEnabled", "isSoundStickerConsumptionEnabled", "isSoundStickerPlaybackEnabled"]) {
        try {
          if (typeof gate[fn] === "function" && gate[fn]() !== true) {
            gate[fn] = () => true;
            changed = true;
          }
        } catch (_) {
          /* skip */
        }
      }
    }
    return changed;
  }

  // Call early and again after WhatsApp loads its settings (it re-reads them a few seconds after start).
  function keepSoundStickersOn() {
    let tries = 0;
    const early = setInterval(() => {
      tries++;
      if (loaderReady()) enableSoundStickers();
      if (tries > 600 || isReady()) clearInterval(early);
    }, 100);
    for (const ms of [3000, 7000, 12000, 20000]) setTimeout(enableSoundStickers, ms);
  }

  function myChat() {
    const prefs = mod("WAWebUserPrefsMeUser");
    const chats = mod("WAWebChatCollection").ChatCollection;
    for (const getter of ["getMaybeMePnUser", "getMeUserOrThrow", "getMaybeMeLidUser"]) {
      try {
        const wid = prefs && prefs[getter] && prefs[getter]();
        if (!wid) continue;
        const chat = chats.get(wid) || chats.get(wid._serialized || String(wid));
        if (chat) return { chat, wid };
        return { chat: null, wid };
      } catch (_) {
        /* next getter */
      }
    }
    return { chat: null, wid: null };
  }

  async function targetChat(target) {
    const chats = mod("WAWebChatCollection").ChatCollection;
    if (target === "me") {
      const { chat, wid } = myChat();
      if (chat) return chat;
      const find = mod("WAWebFindChatAction");
      if (wid && find && find.findOrCreateLatestChat) {
        const res = await find.findOrCreateLatestChat(wid, "forwardSelectedModals");
        return (res && res.chat) || res;
      }
      return null;
    }
    return chats.getActive ? chats.getActive() : null;
  }

  // A logger stand-in: any method call does nothing.
  const quietLogger = new Proxy(function () {}, { get: () => quietLogger, apply: () => quietLogger });

  async function uploadAudio(ogg, chat, signal) {
    const types = mod("WAWebMmsMediaTypes");
    const originFn = def(mod("WAWebMediaGetUploadOriginForChat"));
    let uploadOrigin = 1;
    try {
      if (typeof originFn === "function") uploadOrigin = originFn(chat);
    } catch (_) {
      /* keep 1 */
    }
    const params = {
      blob: new Blob([ogg], { type: "audio/ogg; codecs=opus" }),
      type: types && types.MEDIA_TYPES ? types.MEDIA_TYPES.AUDIO : "audio",
      signal,
      uploadQpl: quietLogger,
      uploadOrigin,
      fileOrigin: undefined,
      userUploadAttemptCount: 0,
      forwardedFromWeb: false,
      isViewOnce: false,
      isHdPhoto: false,
    };
    const main = def(mod("WAWebUploadManagerMainThread"));
    if (main && main.encryptAndUpload) {
      const metricsFn = def(mod("WAWebCreateMediaUploadMetrics"));
      let metrics;
      try {
        metrics = typeof metricsFn === "function" ? metricsFn(params) : undefined;
      } catch (_) {
        metrics = undefined;
      }
      try {
        return await main.encryptAndUpload(params, metrics);
      } catch (e) {
        if (signal && signal.aborted) throw e;
      }
    }
    const fallback = def(mod("WAWebUploadManager"));
    if (fallback && fallback.encryptAndUpload) return fallback.encryptAndUpload(params);
    throw new Error("sendFailed");
  }

  function b64(v) {
    if (!v) return v;
    if (typeof v === "string") return v;
    const bytes = v instanceof Uint8Array ? v : new Uint8Array(v);
    return WASI.builder.b64(bytes);
  }

  async function waitForAck(msg, ms) {
    const ack = mod("WAWebAck");
    const SENT = ack && ack.ACK ? ack.ACK.SENT : 1;
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const a = msg && (msg.ack !== undefined ? msg.ack : msg.attributes && msg.attributes.ack);
      if (typeof a === "number" && a < 0) throw new Error("sendFailed");
      if (typeof a === "number" && a >= SENT) return true;
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  // sticker: { webp: Uint8Array, ogg: Uint8Array, seconds, side, emoji }; target: "open" | "me"
  async function send(sticker, target = "open") {
    if (busy || Date.now() - lastSend < COOLDOWN_MS) throw new Error("waitCooldown");
    if (!isReady()) throw new Error("notReady");
    busy = true;
    try {
      enableSoundStickers();
      const chat = await targetChat(target);
      if (!chat) throw new Error(target === "me" ? "sendFailed" : "openChatFirst");
      if (chat.isReadOnly || chat.canSend === false) throw new Error("chatReadOnly");

      const ctl = new AbortController();
      const up = await uploadAudio(sticker.ogg, chat, ctl.signal);
      const filehash = WASI.builder.b64(await WASI.builder.sha256(sticker.ogg));
      const stickerAudio = {
        deprecatedMms3Url: up.url,
        directPath: up.directPath,
        mediaKey: b64(up.mediaKey),
        mediaKeyTimestamp: up.mediaKeyTimestamp,
        filehash,
        encFilehash: b64(up.encFilehash),
        size: sticker.ogg.length,
        mimetype: "audio/ogg; codecs=opus",
        duration: Math.max(1, Math.round(sticker.seconds)),
      };
      const utils = mod("WAWebSoundStickerUtils");
      if (utils && typeof utils.isCompleteStickerAudio === "function" && !utils.isCompleteStickerAudio(stickerAudio)) {
        throw new Error("sendFailed");
      }

      const opaque = def(mod("WAWebMediaOpaqueData"));
      const MediaPrep = def(mod("WAWebMediaPrep"));
      if (!opaque || !MediaPrep) throw new Error("sendFailed");
      const blob = new Blob([sticker.webp], { type: "image/webp" });
      const mediaBlob = await opaque.createFromData(blob, "image/webp");
      const data = {
        type: "sticker",
        mediaBlob,
        mimetype: "image/webp",
        size: sticker.webp.length,
        fullWidth: sticker.side,
        fullHeight: sticker.side,
        isAnimated: true,
        emojis: [sticker.emoji || "🔊"],
      };
      const prep = new MediaPrep("sticker", Promise.resolve(data));
      const res = await prep.sendToChat({ chat, options: { stickerAudio } });
      const results = mod("WAWebSendMsgResultAction");
      const OK = results && results.SendMsgResult ? results.SendMsgResult.OK : undefined;
      if (res && OK !== undefined && res.messageSendResult !== OK) throw new Error("sendFailed");
      const msg = res && res.msg;
      const hasAudio = msg && (msg.stickerAudio || (msg.attributes && msg.attributes.stickerAudio));
      lastSend = Date.now();
      if (msg) await waitForAck(msg, 30000).catch(() => false);
      return { ok: true, withSound: Boolean(hasAudio) || !msg };
    } finally {
      busy = false;
      lastSend = Math.max(lastSend, Date.now() - COOLDOWN_MS + 1000);
    }
  }

  // For the Help tab and bug reports: which WhatsApp parts we can see. No chat data.
  function diagnostics() {
    const names = [
      "WAWebChatCollection", "WAWebUserPrefsMeUser", "WAWebMmsMediaTypes", "WAWebUploadManagerMainThread",
      "WAWebUploadManager", "WAWebSoundStickerUtils", "WAWebMediaOpaqueData", "WAWebMediaPrep",
      "WAWebSendMsgResultAction", "WAWebAck", "WAWebSoundStickerGating", "WAWebABProps",
    ];
    const found = {};
    for (const n of names) found[n] = Boolean(mod(n));
    let version = "";
    try {
      version = (root.Debug && root.Debug.VERSION) || "";
    } catch (_) {
      /* none */
    }
    return {
      version,
      ready: isReady(),
      modules: found,
      webCodecs: typeof AudioEncoder !== "undefined",
      imageDecoder: typeof ImageDecoder !== "undefined",
      offscreen: typeof OffscreenCanvas !== "undefined",
    };
  }

  WASI.wa = { isReady, enableSoundStickers, keepSoundStickersOn, send, diagnostics, COOLDOWN_MS };
})(typeof globalThis !== "undefined" ? globalThis : this);
