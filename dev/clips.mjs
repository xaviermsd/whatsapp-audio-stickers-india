// Shared by dev/screenshots.mjs and dev/demo.mjs: the real demo clips (in clips-input/, not in git) and helpers
// to drive the panel. Only short moments are used. Credits are in the README "Clip ideas" section.

export const CLIPS = [
  { file: "jonny-lever-meme.mp4", start: 0, end: 4.4, caption: "", emoji: "🤣" },
  { file: "funny-memes-video.mp4", start: 0, end: 4.5, caption: "", emoji: "😂" },
  { file: "el-risitas-laugh.mp4", start: 0, end: 4.6, caption: "", emoji: "😂" },
  { file: "top-25-memes.mp4", start: 9.2, end: 12.2, caption: "", emoji: "😭" },
];

export const SR = `document.getElementById('wasi-india-root').shadowRoot`;

export const state = (page) => page.evaluate(() => document.getElementById("wasi-india-root").dataset.wasiState);

export async function waitState(page, want, ms = 90000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (want.includes(await state(page))) return;
    await page.waitForTimeout(200);
  }
  throw new Error("timeout waiting for " + want);
}

export const click = (page, text) =>
  page.evaluate(([q, t]) => {
    const b = [...eval(q).querySelectorAll("button")].find((x) => x.textContent.trim().includes(t));
    if (!b) throw new Error("no button " + t);
    b.click();
  }, [SR, text]);

// Loads a clip into the panel through its own file input, then sets the moment, caption and emoji.
// typeCaption: a function (page, text) to type it letter by letter for the demo; default sets it at once.
export async function loadClip(page, clip, { typeCaption } = {}) {
  await page.evaluate(async ([q, c]) => {
    const r = eval(q);
    // a loaded clip is swapped through the Change picker; the empty screen uses the drop box input
    const blob = await (await fetch("../clips-input/" + c.file)).blob();
    const name = c.file;
    const file = new File([blob], name, { type: "video/mp4" });
    const input = r.querySelector("input.change-picker") || r.querySelector("input[type=file]");
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change"));
  }, [SR, clip]);
  await waitState(page, ["editing"]);
  await page.evaluate(([q, c]) => {
    const r = eval(q);
    const set = (k, v) => {
      const el = r.querySelector(`input[data-k="${k}"]`);
      if (!el) return;
      el.value = String(v);
      el.dispatchEvent(new Event("input"));
    };
    set("start", c.start);
    set("end", c.end);
    const chip = [...r.querySelectorAll(".chip")].find((x) => x.textContent === c.emoji);
    if (chip) chip.click();
    const v = r.querySelector(".preview video");
    if (v) v.currentTime = c.start + 1.2;
  }, [SR, clip]);
  if (typeCaption && clip.caption) await typeCaption(page, clip.caption);
  else
    await page.evaluate(([q, text]) => {
      const cap = eval(q).querySelector("input[type=text]");
      cap.value = text;
      cap.dispatchEvent(new Event("input"));
    }, [SR, clip.caption]);
  await page.waitForTimeout(500);
}
