const test = require("node:test");
const assert = require("node:assert/strict");
const J = require("../extension/state/stickerJob.js");

function go(job, ...events) {
  for (const e of events) job = J.transition(job, e).job;
  return job;
}

const clip = { duration: 25, hasVideo: true, hasAudio: true };

test("happy path from pick to sent", () => {
  let job = J.initial();
  job = go(job, { type: "pick", name: "meme.mp4" });
  assert.equal(job.state, "loading");
  job = go(job, { type: "loaded", run: job.run, clip, maxSeconds: 10 });
  assert.equal(job.state, "editing");
  assert.equal(job.edit.end, 10, "end is capped to the max sticker length");
  job = go(job, { type: "build" });
  job = go(job, { type: "progress", run: job.run, value: 0.5 });
  assert.equal(job.progress, 0.5);
  job = go(job, { type: "built", run: job.run, sticker: { size: 1000 } });
  assert.equal(job.state, "ready");
  job = go(job, { type: "send" }, { type: "sent" });
  assert.equal(job.state, "sent");
});

test("every refused move throws a plain message", () => {
  for (const [state, moves] of Object.entries(J.MOVES)) {
    for (const type of ["pick", "loaded", "edit", "build", "progress", "built", "cancel", "send", "sent", "failed"]) {
      if (moves[type]) continue;
      const job = { ...J.initial(), state };
      const run = ["loaded", "progress", "built", "failed"].includes(type) ? job.run : undefined;
      assert.throws(() => J.transition(job, { type, run }), J.MoveRefused, `${state} should refuse ${type}`);
    }
  }
});

test("every allowed move lands where the table says", () => {
  for (const [state, moves] of Object.entries(J.MOVES)) {
    for (const [type, to] of Object.entries(moves)) {
      const job = { ...J.initial(), state, clip: { duration: 5 }, sticker: { size: 1 } };
      const next = J.transition(job, { type, run: job.run, clip, value: 0.2, sticker: { size: 1 } }).job;
      assert.equal(next.state, to, `${state} + ${type}`);
    }
  }
});

test("a late answer from an old build is dropped as stale", () => {
  let job = go(J.initial(), { type: "pick" });
  job = go(job, { type: "loaded", run: job.run, clip });
  job = go(job, { type: "build" });
  const oldRun = job.run;
  job = go(job, { type: "cancel" });
  const res = J.transition(job, { type: "built", run: oldRun, sticker: { size: 1 } });
  assert.equal(res.stale, true);
  assert.equal(res.job.state, "editing");
});

test("editing while ready drops the built sticker", () => {
  let job = go(J.initial(), { type: "pick" });
  job = go(job, { type: "loaded", run: job.run, clip }, { type: "build" });
  job = go(job, { type: "built", run: job.run, sticker: { size: 1 } });
  job = go(job, { type: "edit", edit: { start: 2 } });
  assert.equal(job.state, "editing");
  assert.equal(job.sticker, null);
  assert.throws(() => J.transition(job, { type: "send" }), J.MoveRefused);
});

test("edit values are clamped", () => {
  const e = J.clampEdit({ start: -3, end: 99, volume: 9, fit: "weird", zoom: 5, text: "x".repeat(80), speed: 7, textPos: "?" }, { duration: 12 });
  assert.equal(e.start, 0);
  assert.equal(e.end, J.MAX_SECONDS);
  assert.equal(e.volume, 2);
  assert.equal(e.fit, "cover");
  assert.equal(e.zoom, 3);
  assert.equal(J.clampEdit({ zoom: 0.2 }, { duration: 12 }).zoom, 1);
  assert.equal(J.clampEdit({ zoom: 1.65 }, { duration: 12 }).zoom, 1.65);
  assert.equal(e.text, "x".repeat(40));
  assert.equal(e.speed, 1, "unknown speeds fall back to 1x");
  assert.equal(e.textPos, "bottom");
  assert.equal(J.clampEdit({ start: 8, end: 3 }, { duration: 12 }).end, 8);
  assert.equal(J.clampEdit({ start: 2, end: 40 }, { duration: 60 }).end, 2 + J.MAX_SECONDS, "never longer than the max");
});

test("reset gives the same starting values as first load", () => {
  const job = go(J.initial(), { type: "pick" }, { type: "reset" });
  assert.deepEqual(job, J.initial());
});

test("every state has an English and Hindi label", () => {
  for (const s of Object.values(J.STATES)) {
    assert.ok(J.LABELS[s].en && J.LABELS[s].hi, s);
  }
});
