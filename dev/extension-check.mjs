// Loads the real extension into Chromium and opens the real web.whatsapp.com (login page, nobody signed in).
// Checks: no manifest errors, service worker runs, welcome page opens, our scripts run inside WhatsApp's page
// rules (CSP, Trusted Types), the font and logo load through the bridge, and the panel opens.
// Run: node dev/extension-check.mjs   (uses installed Chrome; set CHROMIUM to use another build)
import { chromium } from "playwright-core";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EXT = fileURLToPath(new URL("../extension", import.meta.url));
// Output stays out of git: the login page shows a WhatsApp QR code.
const OUT = fileURLToPath(new URL("./out/extension-check/", import.meta.url));
await mkdir(OUT, { recursive: true });
const CHROMIUM = process.env.CHROMIUM || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const profile = await mkdtemp(join(tmpdir(), "wasi-check-"));
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: CHROMIUM,
  headless: false,
  ignoreDefaultArgs: ["--disable-extensions"],
  viewport: { width: 1360, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--window-position=-2400,0", "--disable-features=DisableLoadExtensionCommandLineSwitch"],
});

const results = {};
let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
results.serviceWorker = sw.url().startsWith("chrome-extension://");
const extId = sw.url().split("/")[2];

await new Promise((r) => setTimeout(r, 1500));
results.welcomeOpened = ctx.pages().some((p) => p.url().includes(`${extId}/welcome.html`));
const welcome = ctx.pages().find((p) => p.url().includes("welcome.html"));
if (welcome) await welcome.screenshot({ path: join(OUT, "welcome-page.png"), fullPage: true });

const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" && /wasi|audio sticker|Trusted|Content Security|Refused|blob:/i.test(m.text())) errors.push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("https://web.whatsapp.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => document.getElementById("wasi-india-root"), null, { timeout: 30000 });
results.panelMounted = true;
await page.waitForTimeout(2500);
results.fontLoaded = await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Baloo 2" && f.status === "loaded"));
results.logoLoaded = await page.evaluate(() => {
  const img = document.getElementById("wasi-india-root").shadowRoot.querySelector("img.mark");
  return Boolean(img && img.complete && img.naturalWidth > 0);
});
await page.screenshot({ path: join(OUT, "launcher.png") });
await page.evaluate(() => window.postMessage({ __wasi_india__: true, dir: "toPage", op: "toggle" }, location.origin));
await page.waitForTimeout(800);
results.panelOpens = await page.evaluate(() => !document.getElementById("wasi-india-root").shadowRoot.querySelector(".panel").hidden);
results.logoLoaded = results.logoLoaded || (await page.evaluate(() => {
  const img = document.getElementById("wasi-india-root").shadowRoot.querySelector("img.mark");
  return Boolean(img && img.complete && img.naturalWidth > 0);
}));
results.storageWorks = await page.evaluate(
  () =>
    new Promise((ok) => {
      const id = 999001;
      addEventListener("message", function on(ev) {
        if (ev.data && ev.data.__wasi_india__ && ev.data.dir === "toPage" && ev.data.id === id) {
          removeEventListener("message", on);
          ok(ev.data.ok);
        }
      });
      postMessage({ __wasi_india__: true, dir: "toBridge", op: "prefs.set", id, prefs: { lang: "en" } }, location.origin);
      setTimeout(() => ok(false), 5000);
    })
);
results.markTag = await page.evaluate(() => { const m = document.getElementById("wasi-india-root").shadowRoot.querySelector(".mark"); return m ? m.tagName + " " + (m.src || "").slice(0, 30) : "none"; });
results.waLoader = await page.evaluate(() => typeof window.require === "function" && typeof window.__d === "function");
await page.screenshot({ path: join(OUT, "panel.png") });
results.errors = errors;
console.log(JSON.stringify(results, null, 2));
await ctx.close();
