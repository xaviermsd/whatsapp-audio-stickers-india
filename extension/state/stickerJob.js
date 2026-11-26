// Sticker job: one sticker from picked clip to sent message.
//
//   empty --pick--> loading --loaded--> editing --build--> building --built--> ready --send--> sending --sent--> sent
//                     |                   ^                  |                   |               |
//                     +--failed--> error  +---- edit --------+-------------------+               +--failed--> error
//
// - A failed send keeps the built sticker, so "error" allows "send" again; a failed load or build does not.
//
// - Any change while building or ready (trim, crop, volume) goes back to editing and drops the built file,
//   so a sticker that no longer matches the screen is never sent.
// - "cancel" while building goes back to editing.
// - Each load and build gets a run number. Answers from an older run are dropped as stale before the move
//   table is checked.
// - "reset" from any state goes back to empty using the same starting values as first load.
//
// No DOM, no chrome.* calls. Works in the browser (window.StickerJob) and in Node (module.exports) for tests.

(function (root) {
  "use strict";

  const STATES = Object.freeze({
    EMPTY: "empty",
    LOADING: "loading",
    EDITING: "editing",
    BUILDING: "building",
    READY: "ready",
    SENDING: "sending",
    SENT: "sent",
    ERROR: "error",
  });

  // Which events each state accepts, and where they lead.
  const MOVES = Object.freeze({
    empty: { pick: "loading" },
    loading: { loaded: "editing", failed: "error", pick: "loading" },
    editing: { edit: "editing", build: "building", pick: "loading" },
    building: { progress: "building", built: "ready", failed: "error", cancel: "editing", edit: "editing" },
    ready: { send: "sending", edit: "editing", build: "building", pick: "loading" },
    sending: { sent: "sent", failed: "error" },
    sent: { edit: "editing", send: "sending", pick: "loading" },
    error: { pick: "loading", edit: "editing", build: "building", send: "sending" }, // send only if a sticker is kept
  });

  // Shown on screen. Keys match STATES values.
  const LABELS = Object.freeze({
    empty: { en: "Pick a video or audio clip", hi: "वीडियो या ऑडियो क्लिप चुनें" },
    loading: { en: "Opening your clip", hi: "आपकी क्लिप खुल रही है" },
    editing: { en: "Cut the part you want", hi: "जो हिस्सा चाहिए उसे काटें" },
    building: { en: "Making your sticker", hi: "आपका स्टिकर बन रहा है" },
    ready: { en: "Sticker ready", hi: "स्टिकर तैयार है" },
    sending: { en: "Sending", hi: "भेजा जा रहा है" },
    sent: { en: "Sent", hi: "भेज दिया" },
    error: { en: "Something went wrong", hi: "कुछ गड़बड़ हो गई" },
  });

  const MAX_SECONDS = 15;
  const SPEEDS = Object.freeze([0.5, 0.75, 1, 1.5, 2]);

  const DEFAULT_EDIT = Object.freeze({
    start: 0, // seconds
    end: 0, // seconds, 0 means "not set yet"
    speed: 1, // one of SPEEDS
    boomerang: false, // play the picture forward then backward
    volume: 1, // 0 to 2
    louder: false, // auto level to a strong peak
    fade: false, // soft fade in and out
    fit: "cover", // "cover" crops to a square, "contain" adds empty edges
    text: "", // optional caption drawn on the sticker
    textPos: "bottom", // "top" or "bottom"
    emoji: "🔊", // emoji tag WhatsApp shows in sticker search
  });

  function initial() {
    return Object.freeze({
      state: STATES.EMPTY,
      run: 0, // run number of the newest load or build
      clip: null, // { name, duration, hasVideo, hasAudio }
      edit: DEFAULT_EDIT,
      progress: 0, // 0 to 1 while building
      sticker: null, // { bytes, size } once built
      error: null, // human message
    });
  }

  class MoveRefused extends Error {}

  // Returns the next job, or throws MoveRefused with a plain message.
  // Stale answers (older run number) return the job unchanged with job.stale = true on the result wrapper.
  function transition(job, event) {
    const type = event && event.type;
    if (!type) throw new MoveRefused("No event given.");

    // Stale check first: a late answer from an older load or build is dropped, whatever the state is now.
    const isAnswer = type === "loaded" || type === "progress" || type === "built" || (type === "failed" && event.run !== undefined);
    if (isAnswer && event.run !== job.run) return { job, stale: true };

    if (type === "reset") return { job: initial(), stale: false };

    const to = (MOVES[job.state] || {})[type];
    if (!to) throw new MoveRefused(`Cannot "${type}" while ${job.state}.`);

    let next;
    switch (type) {
      case "pick":
        next = { ...initial(), state: to, run: job.run + 1, clip: { name: event.name || "clip" } };
        break;
      case "loaded": {
        const clip = { ...job.clip, ...event.clip };
        const end = Math.min(clip.duration || 0, event.maxSeconds || 10);
        next = { ...job, state: to, clip, edit: { ...DEFAULT_EDIT, end }, error: null };
        break;
      }
      case "edit":
        next = {
          ...job,
          state: to,
          run: job.state === STATES.BUILDING ? job.run + 1 : job.run,
          edit: clampEdit({ ...job.edit, ...(event.edit || {}) }, job.clip),
          sticker: null,
          progress: 0,
          error: null,
        };
        break;
      case "build":
        next = { ...job, state: to, run: job.run + 1, progress: 0, sticker: null, error: null };
        break;
      case "progress":
        next = { ...job, progress: Math.max(0, Math.min(1, Number(event.value) || 0)) };
        break;
      case "built":
        next = { ...job, state: to, progress: 1, sticker: event.sticker };
        break;
      case "cancel":
        next = { ...job, state: to, run: job.run + 1, progress: 0 };
        break;
      case "send":
        if (!job.sticker) throw new MoveRefused("There is no sticker to send yet.");
        next = { ...job, state: to, error: null };
        break;
      case "sent":
        next = { ...job, state: to };
        break;
      case "failed":
        // A failed send keeps the built sticker (so Send can be tried again); a failed load or build drops it.
        next = {
          ...job,
          state: to,
          progress: 0,
          sticker: job.state === STATES.SENDING ? job.sticker : null,
          error: String(event.message || "Something went wrong."),
        };
        break;
      default:
        throw new MoveRefused(`Unknown event "${type}".`);
    }
    return { job: Object.freeze(next), stale: false };
  }

  function clampEdit(edit, clip) {
    const duration = (clip && clip.duration) || 0;
    let start = Math.max(0, Number(edit.start) || 0);
    let end = Math.max(0, Number(edit.end) || 0);
    if (duration) {
      start = Math.min(start, duration);
      end = Math.min(end || duration, duration);
    }
    if (end < start) end = start;
    // Never longer than MAX_SECONDS of source.
    if (end - start > MAX_SECONDS) end = start + MAX_SECONDS;
    const volume = Math.max(0, Math.min(2, Number(edit.volume)));
    const speed = SPEEDS.includes(Number(edit.speed)) ? Number(edit.speed) : 1;
    return {
      start,
      end,
      speed,
      boomerang: Boolean(edit.boomerang),
      volume: Number.isFinite(volume) ? volume : 1,
      louder: Boolean(edit.louder),
      fade: Boolean(edit.fade),
      fit: edit.fit === "contain" ? "contain" : "cover",
      text: String(edit.text || "").slice(0, 40),
      textPos: edit.textPos === "top" ? "top" : "bottom",
      emoji: String(edit.emoji || "🔊").slice(0, 8),
    };
  }

  function can(job, type) {
    return Boolean((MOVES[job.state] || {})[type]);
  }

  const api = { STATES, MOVES, LABELS, DEFAULT_EDIT, MAX_SECONDS, SPEEDS, initial, transition, can, clampEdit, MoveRefused };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StickerJob = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
