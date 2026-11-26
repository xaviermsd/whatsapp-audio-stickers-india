// Screenshots every page at phone and desktop widths and flags horizontal overflow and squeezed text.
// Run: npm run dev, then node dev/responsive-check.mjs   Output: dev/out/responsive/ (not in git)
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BASE = (process.env.HARNESS || "http://localhost:4417/dev/harness.html").replace(/dev\/harness\.html$/, "");
const OUT = fileURLToPath(new URL("./out/responsive/", import.meta.url));
await mkdir(OUT, { recursive: true });
const PAGES = {
  welcome: "extension/welcome.html",
  home: "docs/index.html",
  guide: "docs/how-to-send-audio-stickers-on-whatsapp.html",
  hindi: "docs/hi/index.html",
};
const browser = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
let problems = 0;
for (const [w, h, label] of [[390, 844, "phone"], [768, 1024, "tablet"], [1280, 860, "desktop"]]) {
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const [name, path] of Object.entries(PAGES)) {
      await page.goto(BASE + path);
      await page.evaluate(() => document.fonts.ready);
      // scroll through so lazy images load, like a person scrolling
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
      await page.waitForTimeout(500);
      const report = await page.evaluate(() => {
        const out = [];
        const vw = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
        for (const el of document.querySelectorAll("p, li, h1, h2, h3, a, span, b, div")) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== "fixed") out.push(`overflows: <${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 40)}"`);
          // text squeezed into a very narrow column
          if (el.children.length === 0 && el.textContent.trim().length > 25 && r.width > 0 && r.width < 90) out.push(`squeezed (${Math.round(r.width)}px): "${el.textContent.trim().slice(0, 40)}"`);
        }
        return [...new Set(out)].slice(0, 8);
      });
      if (report.length) {
        problems += report.length;
        console.log(`${name} ${label} ${scheme}:\n  ` + report.join("\n  "));
      }
      if (scheme === "light" || label === "phone") await page.screenshot({ path: `${OUT}${name}-${label}-${scheme}.png`, fullPage: true });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(problems ? `${problems} problems found` : "no layout problems found");
