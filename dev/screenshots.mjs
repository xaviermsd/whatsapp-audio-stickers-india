// Drives the dev harness in a real browser and saves README screenshots (light and dark) using real clips.
// Clips are read from clips-input/ (not in git). Each sticker is made, sent to the test chat and saved to
// My stickers, so the screenshots show real results.
// Run: npm run dev (in one terminal), then npm run shots.  Output: docs/screenshots/, docs/media/
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CLIPS, loadClip, SR, waitState, state, click } from "./clips.mjs";

const BASE = process.env.HARNESS || "http://localhost:4417/dev/harness.html";
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--autoplay-policy=no-user-gesture-required"],
});

// The welcome page shown after install (the README "Show me the welcome page" image). Taken from the same files the
// extension ships, so it can never go stale against them.
{
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1.5, colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto(BASE.replace(/dev\/harness\.html$/, "extension/welcome.html"));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + "welcome-page.png", fullPage: true });
  await ctx.close();
  if (process.env.ONLY === "welcome") {
    await browser.close();
    console.log("welcome page saved");
    process.exit(0);
  }
}

for (const scheme of ["dark", "light"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  await page.goto(BASE);
  await page.evaluate(() => document.fonts.ready);
  const panel = async (name) => {
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
      const p = document.getElementById("wasi-india-root").shadowRoot.querySelector(".panel").getBoundingClientRect();
      return { x: p.x, y: p.y, width: p.width, height: p.height };
    });
    console.log(name, scheme, JSON.stringify(box));
    await page.screenshot({ path: OUT + `${name}-${scheme}.png`, clip: box });
  };

  await page.waitForTimeout(600);
  // Step 1 shot: the chat before any sticker, with a "Click here" marker on the lime tab.
  await page.evaluate(() => {
    const t = document.getElementById("wasi-india-root").shadowRoot.querySelector(".launcher").getBoundingClientRect();
    const ring = document.createElement("div");
    ring.id = "shot-marker";
    ring.style.cssText = `position:fixed;z-index:2147483646;left:${t.left - 12}px;top:${t.top - 12}px;width:${t.width + 24}px;height:${t.height + 24}px;border:4px solid #e11d48;border-radius:18px;pointer-events:none;`;
    const label = document.createElement("div");
    label.textContent = "Click here";
    label.style.cssText = `position:fixed;z-index:2147483646;left:${t.left - 190}px;top:${t.top + t.height / 2 - 22}px;padding:8px 16px;border-radius:12px;background:#e11d48;color:#fff;font:800 20px/1.2 "Baloo 2",system-ui,sans-serif;pointer-events:none;box-shadow:0 6px 18px rgb(0 0 0 / .25);`;
    const arrow = document.createElement("div");
    arrow.style.cssText = `position:fixed;z-index:2147483646;left:${t.left - 46}px;top:${t.top + t.height / 2 - 10}px;width:0;height:0;border-top:10px solid transparent;border-bottom:10px solid transparent;border-left:18px solid #e11d48;pointer-events:none;`;
    arrow.className = label.className = "shot-marker";
    ring.className = "shot-marker";
    document.body.append(ring, label, arrow);
  });
  await page.screenshot({ path: OUT + `00-launcher-${scheme}.png` });
  await page.evaluate(() => document.querySelectorAll(".shot-marker").forEach((e) => e.remove()));
  await page.evaluate(() => window.WASI.onToggle());
  await page.waitForTimeout(500);
  await panel("01-pick");

  for (let i = 0; i < CLIPS.length; i++) {
    await loadClip(page, CLIPS[i]);
    if (i === 0) await panel("02-edit");
    await click(page, "Make sticker");
    if (i === 0) {
      await page.waitForTimeout(700);
      await panel("03-building");
    }
    await waitState(page, ["ready", "error"]);
    if ((await state(page)) === "error") throw new Error("build failed for " + CLIPS[i].file);
    await page.evaluate((q) => eval(q).querySelector("[data-build]").scrollIntoView({ block: "end" }), SR);
    if (i === 0) await panel("04-ready");
    await click(page, "Send to this chat");
    await waitState(page, ["sent", "error"]);
    if (i === 0) await panel("05-sent");
    await click(page, "Save to My stickers");
    await page.waitForTimeout(600);
  }

  // Full window: the chat with the real stickers that were sent
  await page.screenshot({ path: OUT + `00-chat-${scheme}.png` });

  await click(page, "My stickers");
  await page.waitForTimeout(900);
  await panel("06-library");
  await click(page, "Help");
  await panel("07-help");
  await page.evaluate((q) => [...eval(q).querySelectorAll(".lang button")].find((b) => b.textContent !== "EN").click(), SR);
  await click(page, "बनाएँ");
  await page.evaluate((q) => eval(q).querySelector("main").scrollTo(0, 0), SR);
  await panel("08-hindi");
  await ctx.close();
}
await browser.close();
console.log("screenshots saved to docs/screenshots");
