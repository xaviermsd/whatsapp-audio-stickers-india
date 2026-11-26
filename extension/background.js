// Service worker: the toolbar button and keyboard shortcut open the panel in WhatsApp Web.
// No network requests, no other sites.

const WA_URL = "https://web.whatsapp.com/";
const pending = new Set(); // tabs that should open the panel once the page says it is ready

async function openPanel() {
  const [tab] = await chrome.tabs.query({ url: WA_URL + "*" });
  if (!tab) {
    const created = await chrome.tabs.create({ url: WA_URL });
    pending.add(created.id);
    return;
  }
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle" });
  } catch (_) {
    // The tab was open before the extension was installed, so our scripts are not in it yet.
    pending.add(tab.id);
    await chrome.tabs.reload(tab.id);
  }
}

chrome.action.onClicked.addListener(() => openPanel());
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "open-panel") openPanel();
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "pageReady" && sender.tab && pending.has(sender.tab.id)) {
    pending.delete(sender.tab.id);
    chrome.tabs.sendMessage(sender.tab.id, { type: "toggle" }).catch(() => {});
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
});
