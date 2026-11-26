// One place for the website's SEO facts: URLs, keywords, FAQs and how-to steps.
// Used by dev/build-site.mjs to write the head tags, JSON-LD, sitemap, robots.txt and llms.txt.
export const SITE = "https://xaviermsd.github.io/whatsapp-audio-stickers-india/";
export const REPO = "https://github.com/xaviermsd/whatsapp-audio-stickers-india";
export const RELEASE = REPO + "/releases/latest";
export const OG = SITE + "brand/social-preview.png";
export const VERSION = "1.2.0";
export const UPDATED = "2026-11-27";

export const KEYWORDS = [
  "WhatsApp audio stickers", "WhatsApp stickers with sound", "sound stickers WhatsApp", "audio sticker maker",
  "WhatsApp sticker maker with sound", "how to send audio stickers on WhatsApp", "WhatsApp Web stickers",
  "voice sticker WhatsApp", "meme stickers with sound", "Hindi stickers", "Chrome extension WhatsApp",
  "WhatsApp audio sticker kaise banaye", "awaaz wale sticker",
];

export const FAQS = [
  ["What are WhatsApp audio stickers?",
    "WhatsApp audio stickers (also called sound stickers) are animated stickers that play a short sound when you tap them. WA Audio Stickers India lets you make them from any video, GIF, photo or your own voice and send them from WhatsApp Web."],
  ["How do I send a sticker with sound on WhatsApp?",
    "Install the free WA Audio Stickers India extension in Chrome, Edge or Brave, open web.whatsapp.com, click the lime tab, pick or record a clip, press Make sticker, then Send to this chat. Your friend taps the sticker and hears the sound."],
  ["How do I make a WhatsApp sticker with sound from a video?",
    "Open the WA Audio Stickers India panel in WhatsApp Web, drop your video (MP4, WebM or MOV), drag the two handles on the waveform to pick up to 15 seconds, press Make sticker and send it. The video keeps its own sound."],
  ["How do I make a voice sticker for WhatsApp?",
    "Press Record voice in the panel, speak, then stop. We turn your voice into a sticker with a moving sound wave, or put it over a photo you choose, ready to send."],
  ["How do I pick the funny part of a clip?",
    "Drag the two lime handles on the waveform, or drag the middle to slide the whole part. Press Play this part to hear it first, or type exact times in From and To."],
  ["Which files can I turn into a sound sticker?",
    "Videos (MP4, WebM, MOV), GIFs, photos (PNG, JPG, WebP) and audio (MP3, M4A, WAV, OGG). You can also record your voice or a selfie video right in the panel."],
  ["Is WA Audio Stickers India free?",
    "Yes. It is completely free and open source under the MIT licence, with no sign-up, no ads and no paid version."],
  ["Is it safe and private?",
    "Yes. Everything is made on your own computer. The extension only asks for storage and web.whatsapp.com, has no server and no tracking, and sends only when you click, one sticker at a time."],
  ["Can I make audio stickers in Hindi?",
    "Yes. You can add captions in Hindi, English or Hinglish, and the whole app can switch to Hindi with one tap."],
  ["Will my friend hear the sound?",
    "Yes, if their WhatsApp is up to date. The sound plays on Android, iPhone and WhatsApp Web when they tap the sticker."],
  ["Does it work on my phone?",
    "It runs on a computer, in WhatsApp Web. Use Send to myself, then forward or star the sticker from your phone to keep it in your sticker tray."],
  ["Why does my sticker have no sound for my friend?",
    "Their WhatsApp needs to be up to date to play sound stickers. If WhatsApp Web itself says it sent the picture without sound, reload WhatsApp Web and send again after a few seconds."],
  ["How do I update to the newest version?",
    "Download the latest zip from GitHub Releases, Extract All, then on chrome://extensions remove the old one and Load unpacked the new folder. Your saved stickers stay in your browser."],
  ["Is this an official WhatsApp tool?",
    "No. It is an unofficial, open-source tool made by Worklancio in India. It is not made by, linked to or approved by WhatsApp or Meta."],
];

export const STEPS = [
  ["Download the extension", "Get the free zip from the GitHub Releases page and unzip it."],
  ["Load it in your browser", "Open chrome://extensions (or edge:// or brave://), turn on Developer mode and click Load unpacked."],
  ["Open WhatsApp Web", "Go to web.whatsapp.com, open a chat and click the lime tab on the right edge."],
  ["Pick or record a clip", "Drop a video, GIF, photo or audio file, or record your voice or a selfie video."],
  ["Cut and style", "Drag the handles on the waveform to pick the best part (up to 15 seconds), play it, then set speed, volume and an optional caption."],
  ["Make and send", "Press Make sticker, then Send to this chat. It plays with sound when tapped."],
];
