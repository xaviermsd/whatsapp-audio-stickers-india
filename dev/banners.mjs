// Resizes the designer's two banners (light and dark) to README-friendly 1600 px wide PNGs. Pixels are not changed.
import { chromium } from "playwright-core";
import { readFile, writeFile } from "node:fs/promises";
const root = new URL("..", import.meta.url);
const b = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await b.newPage();
for (const [src, dst, w] of [["brand/final/wordmark-horizontal.png", "docs/brand/banner-light.png", 1600], ["brand/final/wordmark-horizontal-dark.png", "docs/brand/banner-dark.png", 1600], ["brand/final/wordmark-horizontal.png", "extension/icons/banner-light.png", 760], ["brand/final/wordmark-horizontal-dark.png", "extension/icons/banner-dark.png", 760]]) {
  const data = "data:image/png;base64," + (await readFile(new URL(src, root))).toString("base64");
  const bytes = await p.evaluate(async ([d, w]) => {
    const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = d; });
    const h = Math.round((img.height / img.width) * w);
    const c = new OffscreenCanvas(w, h); const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, w, h);
    return Array.from(new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer()));
  }, [data, w]);
  await writeFile(new URL(dst, root), Buffer.from(bytes));
  console.log("wrote", dst, bytes.length);
}
await b.close();
