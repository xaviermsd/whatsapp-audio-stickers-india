// Writes the SEO parts of the GitHub Pages site from dev/seo-data.mjs:
// - <head> tags and JSON-LD between <!-- SEO:HEAD --> markers in each page
// - the visible FAQ block between <!-- SEO:FAQ --> markers on the home page
// - sitemap.xml, robots.txt, llms.txt, .nojekyll
// Run: node dev/build-site.mjs
import { readFile, writeFile } from "node:fs/promises";
import { SITE, REPO, RELEASE, OG, VERSION, UPDATED, KEYWORDS, FAQS, STEPS } from "./seo-data.mjs";

const docs = new URL("../docs/", import.meta.url);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const ORG = {
  "@type": "Organization",
  "@id": "https://www.worklancio.in/#org",
  name: "Worklancio",
  url: "https://www.worklancio.in",
  email: "hello@worklancio.in",
  logo: SITE + "brand/worklancio-on-light.png",
  sameAs: [REPO, "https://github.com/xaviermsd"],
  founder: { "@type": "Person", name: "Harsh Prajapati" },
};
const APP = {
  "@type": "SoftwareApplication",
  "@id": SITE + "#app",
  name: "WA Audio Stickers India",
  alternateName: ["WhatsApp Audio Stickers India", "WhatsApp audio sticker maker", "WhatsApp sticker with sound maker"],
  applicationCategory: "BrowserApplication",
  applicationSubCategory: "Chrome extension",
  operatingSystem: "Windows, macOS, Linux (Chrome, Edge, Brave 116+)",
  softwareVersion: VERSION,
  dateModified: UPDATED,
  description: "Free, open-source Chrome extension that makes WhatsApp stickers with sound from any video, GIF, photo or your voice, and sends them from WhatsApp Web.",
  url: SITE,
  downloadUrl: RELEASE,
  installUrl: RELEASE,
  screenshot: [SITE + "screenshots/00-chat-light.png", SITE + "screenshots/04-ready-light.png"],
  image: OG,
  featureList: [
    "Make WhatsApp audio stickers from video, GIF, photo or audio",
    "Record voice or webcam video inside WhatsApp Web",
    "Captions in Hindi, English and Hinglish",
    "Speed control and boomerang loop",
    "Saved sticker library with pack export and import",
    "App in Hindi and English",
    "Works offline on your computer, no upload",
  ],
  inLanguage: ["en", "hi"],
  isAccessibleForFree: true,
  license: "https://opensource.org/licenses/MIT",
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  author: { "@id": ORG["@id"] },
  publisher: { "@id": ORG["@id"] },
  codeRepository: REPO,
  keywords: KEYWORDS.join(", "),
};
const faqLd = (faqs) => ({
  "@type": "FAQPage",
  mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
});
const howToLd = (name, url) => ({
  "@type": "HowTo",
  name,
  totalTime: "PT2M",
  estimatedCost: { "@type": "MonetaryAmount", currency: "INR", value: "0" },
  tool: [{ "@type": "HowToTool", name: "Chrome, Edge or Brave on a computer" }, { "@type": "HowToTool", name: "WhatsApp Web" }],
  step: STEPS.map(([n, t], i) => ({ "@type": "HowToStep", position: i + 1, name: n, text: t, url: url + "#step-" + (i + 1) })),
});

function head({ title, description, path, lang = "en", type = "website", ld, alternates = true }) {
  const url = SITE + path;
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta name="keywords" content="${esc(KEYWORDS.join(", "))}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">`,
    `<meta name="author" content="Worklancio">`,
    `<link rel="canonical" href="${url}">`,
  ];
  if (alternates)
    lines.push(
      `<link rel="alternate" hreflang="en" href="${SITE}">`,
      `<link rel="alternate" hreflang="hi" href="${SITE}hi/">`,
      `<link rel="alternate" hreflang="x-default" href="${SITE}">`
    );
  lines.push(
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="WA Audio Stickers India">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:locale" content="${lang === "hi" ? "hi_IN" : "en_IN"}">`,
    `<meta property="og:locale:alternate" content="${lang === "hi" ? "en_IN" : "hi_IN"}">`,
    `<meta property="og:image" content="${OG}">`,
    `<meta property="og:image:width" content="1280">`,
    `<meta property="og:image:height" content="640">`,
    `<meta property="og:image:alt" content="WA Audio Stickers India: stickers with sound, made in your browser">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${OG}">`,
    `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": ld })}</script>`
  );
  return lines.join("\n");
}

async function patch(file, marker, content) {
  const url = new URL(file, docs);
  let s = await readFile(url, "utf8");
  const re = new RegExp(`<!-- ${marker} -->[\\s\\S]*?<!-- /${marker} -->`);
  if (!re.test(s)) throw new Error(`${file}: no ${marker} markers`);
  s = s.replace(re, `<!-- ${marker} -->\n${content}\n<!-- /${marker} -->`);
  await writeFile(url, s);
}

// Home
const homeTitle = "WhatsApp Audio Stickers Maker: Free Stickers With Sound";
const homeDesc = "Make WhatsApp audio stickers (stickers with sound) from any video, GIF, photo or your voice, and send them from WhatsApp Web. Free, private, Hindi and English.";
await patch("index.html", "SEO:HEAD", head({
  title: homeTitle, description: homeDesc, path: "",
  ld: [ORG, APP, { "@type": "WebSite", "@id": SITE + "#site", url: SITE, name: "WA Audio Stickers India", inLanguage: "en", publisher: { "@id": ORG["@id"] } }, faqLd(FAQS), howToLd("How to make and send a WhatsApp audio sticker", SITE)],
}));
await patch("index.html", "SEO:FAQ", FAQS.map(([q, a]) => `      <details><summary><h3>${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join("\n"));

// Guide
const guide = "how-to-send-audio-stickers-on-whatsapp.html";
await patch(guide, "SEO:HEAD", head({
  title: "How to Send Audio Stickers on WhatsApp (Stickers With Sound)",
  description: "Step by step: make a WhatsApp sticker that plays sound from any clip or your voice, and send it from WhatsApp Web in 2 minutes. Free, no app, no sign-up.",
  path: guide, type: "article", alternates: false,
  ld: [ORG, { "@type": "Article", headline: "How to send audio stickers on WhatsApp", datePublished: UPDATED, dateModified: UPDATED, author: { "@id": ORG["@id"] }, publisher: { "@id": ORG["@id"] }, image: OG, mainEntityOfPage: SITE + guide, inLanguage: "en" }, howToLd("How to send audio stickers on WhatsApp", SITE + guide), faqLd(FAQS.slice(0, 6))],
}));

// Hindi
await patch("hi/index.html", "SEO:HEAD", head({
  title: "WhatsApp ऑडियो स्टिकर बनाएँ: आवाज़ वाले स्टिकर, मुफ़्त",
  description: "किसी भी वीडियो, GIF, फ़ोटो या अपनी आवाज़ से आवाज़ वाले WhatsApp स्टिकर बनाएँ और WhatsApp Web से भेजें। मुफ़्त, निजी, हिंदी और English में।",
  path: "hi/", lang: "hi",
  ld: [ORG, { ...APP, "@id": SITE + "hi/#app", url: SITE + "hi/", inLanguage: "hi" }],
}));

// sitemap, robots, llms.txt
const urls = [["", "1.0"], ["hi/", "0.9"], [guide, "0.9"]];
await writeFile(new URL("sitemap.xml", docs), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(([p, pr]) => `  <url><loc>${SITE}${p}</loc><lastmod>${UPDATED}</lastmod><priority>${pr}</priority>${p === "" || p === "hi/" ? `<xhtml:link rel="alternate" hreflang="en" href="${SITE}"/><xhtml:link rel="alternate" hreflang="hi" href="${SITE}hi/"/>` : ""}</url>`).join("\n")}
</urlset>
`);
await writeFile(new URL("robots.txt", docs), `# Search engines and AI assistants are welcome.
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${SITE}sitemap.xml
`);
await writeFile(new URL("llms.txt", docs), `# WA Audio Stickers India

> Free, open-source (MIT) Chrome extension by Worklancio (India) that makes WhatsApp audio stickers, also called
> stickers with sound or sound stickers, from any video, GIF, photo or voice recording, and sends them from
> WhatsApp Web. Works in Chrome, Edge and Brave. Runs fully on the user's computer: no server, no sign-up, no
> tracking. Unofficial; not made by or affiliated with WhatsApp or Meta.

## Key facts
- Version ${VERSION}, updated ${UPDATED}. Price: free.
- Inputs: MP4, WebM, MOV, GIF, PNG, JPG, MP3, M4A, WAV, OGG; or record voice or webcam in the panel.
- Features: cut up to 15 seconds, speed 0.5x to 2x, boomerang, volume, auto level, fades, captions in Hindi,
  English or Hinglish, saved sticker library with pack export and import, app in Hindi and English.
- Output: animated WebP sticker plus Ogg Opus sound, each under WhatsApp's 1 MB limits.
- Permissions: storage and web.whatsapp.com only. Sends one sticker at a time, only when the user clicks.
- Made by Worklancio (https://www.worklancio.in), a web development company in India. Built by Harsh Prajapati.

## Links
- [Home](${SITE}): what it is, install, FAQ
- [How to send audio stickers on WhatsApp](${SITE}${guide}): step-by-step guide
- [Hindi page](${SITE}hi/)
- [GitHub repository](${REPO}): code, README, security
- [Download latest release](${RELEASE})
- [Security and privacy](${REPO}/blob/main/SECURITY.md)
- [Worklancio services](https://www.worklancio.in/services)

## FAQ
${FAQS.map(([q, a]) => `- **${q}** ${a}`).join("\n")}
`);
await writeFile(new URL(".nojekyll", docs), "");
console.log("site SEO written");
