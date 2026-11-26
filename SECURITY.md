# Security and privacy

We built WA Audio Stickers India to be safe to install. This page says exactly what it can and cannot do.

## What the extension can touch

| | |
|---|---|
| Websites | Only `https://web.whatsapp.com`. It cannot read or change any other site. |
| Permissions | `storage` and `unlimitedStorage` only, to keep your saved stickers on your own computer. |
| Not asked for | Cookies, tabs list, history, downloads, "all sites", native helper apps, clipboard reading, identity. |
| Microphone and camera | Only when you press **Record voice** or **Record video**, through the browser's own permission prompt. Stopped the moment recording ends. |

## What leaves your computer

**Nothing from us.** The extension has no server, no analytics, no ads, no tracking, no remote code and no
updates from anywhere except the Chrome Web Store or this repo.

The only thing that ever leaves is the sticker you choose to send. It goes through WhatsApp Web's own upload and
send code, so it is end-to-end encrypted by WhatsApp exactly like any sticker or voice note you send.

## How we keep it that way

- **Tests that fail on purpose** ([tests/security.test.js](tests/security.test.js)) if anyone adds a network call,
  a new permission, a new website, `eval`, HTML string injection or a link without `rel="noopener noreferrer"`.
- **No dependencies at runtime.** The extension uses only built-in browser features (WebCodecs, WebAudio, Canvas).
  Nothing from npm ships inside it. The only bundled file not written by us is the Baloo 2 font (open licence).
- **Trusted Types friendly.** The panel is built with plain DOM calls inside a Shadow DOM, never `innerHTML`.
- **Strict page rules** for extension pages: `connect-src 'none'`, no inline or remote scripts.
- **Small, fixed bridge.** The page part and the extension part talk through `postMessage` checked for the same
  window and origin, and the bridge answers only eight named requests (stickers, settings, font, logo).
  Saved stickers are checked for size and format before they are stored.

## Staying within WhatsApp's normal use

- Sends only when **you** click Send, to the chat you have open or to yourself.
- One sticker at a time, with a 3 second gap. No bulk sending, no lists of contacts, no scheduling, no
  automation, no reading of your messages or contacts.
- Files are kept under WhatsApp's own limits (1 MB picture, 1 MB sound).
- To play sound stickers, the extension turns on WhatsApp Web's own sound sticker switches **in your browser
  tab only**. It does not change anything on your account or on WhatsApp's servers.

This is an unofficial tool. Any add-on for WhatsApp Web carries some risk to your account, so please send
stickers to people you know and do not use it for spam.

## Report a problem

Found a security issue? Please do not open a public issue. Email **hello@worklancio.in** with the subject
"Security: WA Audio Stickers" and we will reply within 3 working days.
