// Recorder: voice or video from the microphone and camera.
//
//   idle --ask--> asking --granted--> recording --stop | limit--> done
//                   |                     |
//                   +--denied--> denied   +--failed--> idle
//   done / denied --ask--> asking;  any --reset--> idle
//
// No DOM here: the panel does getUserMedia and MediaRecorder and reports events.

(function (root) {
  "use strict";
  const STATES = Object.freeze({ IDLE: "idle", ASKING: "asking", RECORDING: "recording", DONE: "done", DENIED: "denied" });
  const MOVES = Object.freeze({
    idle: { ask: "asking" },
    asking: { granted: "recording", denied: "denied", reset: "idle" },
    recording: { stop: "done", limit: "done", failed: "idle", tick: "recording" },
    done: { ask: "asking" },
    denied: { ask: "asking" },
  });
  const MAX_SECONDS = 15;

  function initial() {
    return Object.freeze({ state: STATES.IDLE, kind: null, seconds: 0 });
  }

  function transition(rec, event) {
    if (event.type === "reset") return initial();
    const to = (MOVES[rec.state] || {})[event.type];
    if (!to) throw new Error(`Cannot "${event.type}" while ${rec.state}.`);
    const next = { ...rec, state: to };
    if (event.type === "ask") {
      next.kind = event.kind === "video" ? "video" : "voice";
      next.seconds = 0;
    }
    if (event.type === "tick") {
      next.seconds = Math.min(MAX_SECONDS, Number(event.seconds) || 0);
      if (next.seconds >= MAX_SECONDS) next.state = STATES.DONE;
    }
    return Object.freeze(next);
  }

  const api = { STATES, MOVES, MAX_SECONDS, initial, transition };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Recorder = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
