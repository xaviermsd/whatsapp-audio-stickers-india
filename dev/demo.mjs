// Records the README demo with real clips (clips-input/, not in git): open the panel, drop a clip, make the
// sticker, send it, do a second one, then show My stickers. Saves docs/media/demo.gif and demo.mp4.
// Run: npm run dev, then node dev/demo.mjs   (needs ffmpeg on PATH)
import { chromium } from "playwright-core";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { CLIPS, loadClip, SR, waitState, click } from "./clips.mjs";

const BASE = process.env.HARNESS || "http://localhost:4417/dev/harness.html";
const MEDIA = fileURLToPath(new URL("../docs/media/", import.meta.url));
const TMP = join(MEDIA, "rec-tmp");
await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

const W = 1280, H = 760;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: process.env.SCHEME || "light" });
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => document.fonts.ready);
const wait = (ms) => page.waitForTimeout(ms);

// Screen capture through the DevTools screencast (frames with timestamps), joined by ffmpeg below.
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on("Page.screencastFrame", async (f) => {
  frames.push({ data: f.data, t: f.metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await wait(900);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
await wait(900);

// 1. Click the lime tab
await page.evaluate((q) => eval(q).querySelector(".launcher").click(), SR);
await wait(1300);

// 2. Two real clips: drop, make, send
for (const clip of [CLIPS[0], CLIPS[2]]) {
  await loadClip(page, clip);
  await wait(1200);
  await page.evaluate((q) => {
    const b = [...eval(q).querySelectorAll("button")].find((x) => x.textContent.includes("Make sticker"));
    b.scrollIntoView({ block: "center", behavior: "smooth" });
  }, SR);
  await wait(900);
  await click(page, "Make sticker");
  await waitState(page, ["ready", "error"]);
  await page.evaluate((q) => eval(q).querySelector("[data-build]").scrollIntoView({ block: "end", behavior: "smooth" }), SR);
  await wait(1600);
  await click(page, "Send to this chat");
  await waitState(page, ["sent", "error"]);
  await wait(1200);
  await click(page, "Save to My stickers");
  await wait(900);
}

// 3. My stickers
await click(page, "My stickers");
await wait(2400);
await cdp.send("Page.stopScreencast");
await ctx.close();
await browser.close();

// Frames plus an ffmpeg concat list that keeps each frame's real on-screen time.
let list = "";
const name = (i) => "f" + String(i).padStart(5, "0") + ".jpg";
for (let i = 0; i < frames.length; i++) {
  await writeFile(join(TMP, name(i)), Buffer.from(frames[i].data, "base64"));
  const dur = i < frames.length - 1 ? Math.max(0.02, frames[i + 1].t - frames[i].t) : 2;
  list += "file '" + name(i) + "'\nduration " + dur.toFixed(3) + "\n";
}
list += "file '" + name(frames.length - 1) + "'\n";
await writeFile(join(TMP, "list.txt"), list);
const input = ["-f", "concat", "-safe", "0", "-i", join(TMP, "list.txt")];

execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...input, "-vf", "fps=10,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", join(MEDIA, "demo.gif")]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...input, "-vf", "fps=30,scale=1280:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "23", join(MEDIA, "demo.mp4")]);
await rm(TMP, { recursive: true, force: true });
console.log("saved docs/media/demo.gif and demo.mp4,", frames.length, "frames");
