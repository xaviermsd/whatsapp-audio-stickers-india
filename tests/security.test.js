// Guard tests: they fail if anyone adds network calls, remote code, new permissions or unsafe DOM writes.
// If one of these fails on purpose, update SECURITY.md in the same change and explain why.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const EXT = path.join(__dirname, "..", "extension");
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}
const js = files(EXT).filter((f) => f.endsWith(".js"));
const read = (f) => fs.readFileSync(f, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("manifest asks only for storage and WhatsApp Web", () => {
  const m = JSON.parse(read(path.join(EXT, "manifest.json")));
  assert.deepEqual(m.permissions, ["storage", "unlimitedStorage"]);
  assert.deepEqual(m.host_permissions, ["https://web.whatsapp.com/*"]);
  assert.equal(m.optional_permissions, undefined);
  assert.equal(m.externally_connectable, undefined, "no other site or extension may message us");
  for (const cs of m.content_scripts) assert.deepEqual(cs.matches, ["https://web.whatsapp.com/*"]);
  for (const w of m.web_accessible_resources || []) assert.deepEqual(w.matches, ["https://web.whatsapp.com/*"]);
  assert.match(m.content_security_policy.extension_pages, /connect-src 'none'/);
  assert.doesNotMatch(m.content_security_policy.extension_pages, /unsafe-eval|unsafe-inline|https?:/);
});

test("no network calls except reading our own bundled files", () => {
  for (const f of js) {
    const s = strip(read(f));
    assert.doesNotMatch(s, /XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts/, f);
    for (const m of s.matchAll(/fetch\(([^)]*)\)/g)) {
      assert.match(m[1], /^chrome\.runtime\.getURL\(/, `${path.basename(f)} fetches ${m[1]}`);
    }
  }
});

test("no remote code, eval or HTML string injection", () => {
  for (const f of js) {
    const s = strip(read(f));
    assert.doesNotMatch(s, /\beval\(|new Function\(|setTimeout\(\s*["'`]|setInterval\(\s*["'`]/, f);
    assert.doesNotMatch(s, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/, f);
    assert.doesNotMatch(s, /<script|https?:\/\/(?!web\.whatsapp\.com|github\.com\/xaviermsd|www\.worklancio\.in|wa\.me\/919898528376|www\.w3\.org)/, f);
  }
});

test("outside links open safely", () => {
  const panel = read(path.join(EXT, "ui", "panel.js"));
  for (const m of panel.matchAll(/target: "_blank"[^}]*/g)) assert.match(m[0], /rel: "noopener noreferrer"/);
});

test("bridge only answers a fixed list of requests from this page", () => {
  const b = read(path.join(EXT, "bridge.js"));
  assert.match(b, /ev\.source !== window \|\| ev\.origin !== location\.origin/);
  assert.match(b, /Object\.prototype\.hasOwnProperty\.call\(ops, d\.op\)/);
  const ops = [...b.matchAll(/async "([a-z.]+)"\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(ops, ["brand.get", "fonts.get", "lib.delete", "lib.list", "lib.put", "lib.update", "prefs.get", "prefs.set"]);
});

test("sending has a cooldown and only targets the open chat or yourself", () => {
  const s = read(path.join(EXT, "wa", "sender.js"));
  assert.match(s, /const COOLDOWN_MS = 3000;/);
  assert.match(s, /if \(busy \|\| Date\.now\(\) - lastSend < COOLDOWN_MS\)/);
  assert.doesNotMatch(strip(s), /forEach\([^)]*send|for \(const chat of|\.getModelsArray\(\)/, "no loops over chats");
});
