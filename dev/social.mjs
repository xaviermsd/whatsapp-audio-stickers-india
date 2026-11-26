// Makes the 1280 x 640 social preview (GitHub, WhatsApp, X, LinkedIn link cards) from the designer's dark banner.
// Run: node dev/social.mjs  ->  docs/brand/social-preview.png
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const b64 = async (p) => (await readFile(new URL(p, root))).toString("base64");
const banner = await b64("brand/final/wordmark-horizontal-dark.png");
const font = await b64("extension/fonts/baloo-2-latin-wght-normal.woff2");

const html = `<!doctype html><html><head><style>
@font-face { font-family: "Baloo 2"; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 400 800; }
html, body { margin: 0; width: 1280px; height: 640px; }
body { background: #0d0f0a; color: #f4f7ea; font-family: "Baloo 2", sans-serif; display: grid; place-items: center;
  background-image: radial-gradient(rgb(244 247 234 / .10) 1.5px, transparent 1.5px); background-size: 28px 28px; }
.wrap { width: 1200px; text-align: center; }
img { width: 1060px; display: block; margin: -6px auto -18px; mix-blend-mode: lighten; -webkit-mask-image: radial-gradient(ellipse 72% 70% at 50% 50%, #000 62%, transparent 100%); }
h1 { margin: 0; font-size: 50px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
h1 span { color: #d6ff36; }
.chips { display: flex; gap: 14px; justify-content: center; margin-top: 22px; }
.chip { padding: 8px 22px 5px; border: 2px solid #3d4430; border-radius: 999px; font-size: 24px; font-weight: 700; color: #a9ae9c; }
.chip.on { background: #d6ff36; color: #080808; border-color: #080808; box-shadow: 4px 4px 0 #000; }
</style></head><body><div class="wrap">
<img src="data:image/png;base64,${banner}" alt="">
<h1>Stickers with <span>sound</span>, made in your browser</h1>
<div class="chips"><div class="chip on">Free and open source</div><div class="chip">Hindi + English</div><div class="chip">100% private</div></div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: fileURLToPath(new URL("docs/brand/social-preview.png", root)) });
await browser.close();
console.log("wrote docs/brand/social-preview.png");
