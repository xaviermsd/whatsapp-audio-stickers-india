// Makes every icon and logo size from the designer's files in brand/final (never edited).
// The artwork is not redrawn: the plain background is made transparent (flood fill from the edges, so the white
// peel inside the outline stays), trimmed and resized.
// Run: node dev/brand-assets.mjs   (uses the installed Chrome as the image engine)
import { chromium } from "playwright-core";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = async (p) => "data:image/png;base64," + (await readFile(new URL(p, root))).toString("base64");
const browser = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage();
await page.setContent("<body></body>");

const jobs = await page.evaluate(
  async ({ symbol }) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });

    // Background to transparent: flood fill from the border over near-white pixels; edge pixels next to the
    // removed area get alpha from how dark they are and become pure ink, so they look clean on dark too.
    function cutout(img) {
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      const p = d.data, w = c.width, h = c.height;
      const bg = new Uint8Array(w * h);
      const light = (i) => Math.min(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]) > 228 && p[i * 4 + 3] > 0;
      const stack = [];
      for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
      for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
      while (stack.length) {
        const i = stack.pop();
        if (bg[i] || !light(i)) continue;
        bg[i] = 1;
        const x = i % w, y = (i / w) | 0;
        if (x > 0) stack.push(i - 1);
        if (x < w - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - w);
        if (y < h - 1) stack.push(i + w);
      }
      for (let i = 0; i < w * h; i++) {
        if (bg[i]) { p[i * 4 + 3] = 0; continue; }
        const x = i % w, y = (i / w) | 0;
        let edge = false;
        for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && bg[yy * w + xx]) { edge = true; break; }
        }
        if (!edge) continue;
        const r = p[i * 4], gg = p[i * 4 + 1], b = p[i * 4 + 2];
        const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
        if (sat > 60) continue; // lime or coloured pixel: keep as is
        const lum = (r + gg + b) / 3;
        const a = Math.max(0, Math.min(255, Math.round(((245 - lum) / 245) * 255 * 1.15)));
        p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = Math.round(Math.min(lum, 90) * 0.4);
        p[i * 4 + 3] = Math.min(p[i * 4 + 3], a);
      }
      g.putImageData(d, 0, 0);
      return c;
    }

    function bounds(c) {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }

    async function png(c) {
      const blob = await c.convertToBlob({ type: "image/png" });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }

    function square(src, b, size, pad) {
      const c = new OffscreenCanvas(size, size);
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      const inner = size * (1 - pad * 2);
      const s = inner / Math.max(b.w, b.h);
      g.drawImage(src, b.x, b.y, b.w, b.h, (size - b.w * s) / 2, (size - b.h * s) / 2, b.w * s, b.h * s);
      return c;
    }

    // Step-down resize keeps small icons crisp.
    function stepDown(src, b, size, pad) {
      let cur = square(src, b, 1024, pad);
      while (cur.width / 2 >= size) {
        const n = new OffscreenCanvas(cur.width / 2, cur.width / 2);
        const g = n.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(cur, 0, 0, n.width, n.height);
        cur = n;
      }
      if (cur.width === size) return cur;
      const out = new OffscreenCanvas(size, size);
      const g = out.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(cur, 0, 0, size, size);
      return out;
    }

    const out = {};
    const sym = cutout(await load(symbol));
    const sb = bounds(sym);
    for (const s of [16, 32, 48, 128]) out[`extension/icons/icon${s}.png`] = await png(stepDown(sym, sb, s, s <= 32 ? 0.02 : 0.04));
    out["extension/icons/symbol-96.png"] = await png(stepDown(sym, sb, 96, 0.02));
    out["docs/brand/symbol-512.png"] = await png(stepDown(sym, sb, 512, 0.04));
    out["docs/brand/symbol-1024.png"] = await png(square(sym, sb, 1024, 0.04));

    // Wordmark banners (light and dark) come straight from the designer: see dev/banners.mjs.
    return out;
  },
  { symbol: await read("brand/final/symbol.png") }
);

for (const [path, bytes] of Object.entries(jobs)) {
  const url = new URL(path, root);
  await mkdir(new URL(".", url), { recursive: true });
  await writeFile(url, Buffer.from(bytes));
  console.log("wrote", path, bytes.length, "bytes");
}
await browser.close();
