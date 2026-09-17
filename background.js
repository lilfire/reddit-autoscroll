const sessions = new Map();
const defaults = { speed: 80, direction: 1, background: true, waitForVideos: true, videoSpeedPercent: 25, autoImages: true, waitForImages: true, imageSpeedPercent: 25, imageSeconds: 3 };

async function badge(tabId, text) {
  await browser.browserAction.setBadgeText({ tabId, text }).catch(() => {});
  await browser.browserAction.setBadgeBackgroundColor({ tabId, color: "#176c54" }).catch(() => {});
}

function stop(tabId) {
  sessions.delete(tabId);
  void browser.tabs.sendMessage(tabId, { type: "scroll-state", running: false, speed: 0, direction: 1 }).catch(() => {});
  void badge(tabId, "");
}

async function togglePause(tabId, session) {
  session.paused = !session.paused;
  session.last = Date.now();
  await browser.tabs.sendMessage(tabId, { type: "scroll-state", running: !session.paused, paused: session.paused, speed: session.speed, direction: session.direction, waitForVideos: session.waitForVideos, videoSpeedPercent: session.videoSpeedPercent, autoImages: session.autoImages, waitForImages: session.waitForImages, imageSpeedPercent: session.imageSpeedPercent, imageSeconds: session.imageSeconds });
  await badge(tabId, session.paused ? "Ⅱ" : "ON");
}

async function start(tabId, options) {
  const speed = Number(options.speed);
  if (!Number.isFinite(speed) || speed < 1 || speed > 2000) throw new Error("Hastigheten må være mellom 1 og 2000.");
  const videoSpeedPercent = Number(options.videoSpeedPercent ?? 25);
  if (!Number.isFinite(videoSpeedPercent) || videoSpeedPercent < 1 || videoSpeedPercent > 100) throw new Error("Videohastigheten må være mellom 1 og 100 %.");
  const imageSpeedPercent = Number(options.imageSpeedPercent ?? 25);
  if (!Number.isFinite(imageSpeedPercent) || imageSpeedPercent < 1 || imageSpeedPercent > 100) throw new Error("Bildehastigheten må være mellom 1 og 100 %.");
  const imageSeconds = Number(options.imageSeconds ?? 3);
  if (!Number.isFinite(imageSeconds) || imageSeconds < 0.5 || imageSeconds > 60) throw new Error("Sekunder per bilde må være mellom 0,5 og 60.");
  const settings = { speed, direction: options.direction === -1 ? -1 : 1, background: options.background !== false, waitForVideos: options.waitForVideos !== false, videoSpeedPercent, autoImages: options.autoImages !== false, waitForImages: options.waitForImages !== false, imageSpeedPercent, imageSeconds };
  await browser.tabs.executeScript(tabId, { file: "content.js" });
  await browser.tabs.sendMessage(tabId, { type: "scroll-reset" });
  await browser.tabs.sendMessage(tabId, { type: "scroll-state", running: true, ...settings });
  sessions.set(tabId, { ...settings, paused: false, last: Date.now(), busy: false });
  await browser.storage.local.set({ settings });
  await badge(tabId, "ON");
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type === "frame-video-report") {
    const session = sender?.tab && sessions.get(sender.tab.id);
    if (!session || session.paused || !session.waitForVideos || !sender.frameId) return;
    let host;
    try { host = new URL(sender.url).hostname; } catch { return; }
    if (host !== "redgifs.com" && !host.endsWith(".redgifs.com")) return;
    await browser.tabs.sendMessage(sender.tab.id, { type: "frame-video-update", frameId: sender.frameId, frameUrl: sender.url, videos: message.videos }, { frameId: 0 }).catch(() => {});
    return { viewport: session.viewport || null };
  }
  if (message.type !== "control") return;
  try {
    const tab = sender?.tab || (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab) throw new Error("Ingen valgt fane.");
    if (message.action === "start") await start(tab.id, message.settings);
    if (message.action === "pause") {
      const session = sessions.get(tab.id);
      if (session) await togglePause(tab.id, session);
    }
    if (message.action === "stop") stop(tab.id);
    if (message.action === "skip" && sessions.has(tab.id)) {
      await browser.tabs.sendMessage(tab.id, { type: "scroll-skip" }, { frameId: 0 });
    }
    const saved = await browser.storage.local.get("settings");
    const session = sessions.get(tab.id);
    return { settings: session || saved.settings || defaults, video: session?.video || null, status: session ? (session.paused ? "paused" : "running") : "stopped" };
  } catch (error) { return { error: error.message }; }
});

setInterval(() => {
  for (const [tabId, session] of sessions) {
    if (session.paused || session.busy) continue;
    const now = Date.now();
    const seconds = Math.min((now - session.last) / 1000, 2);
    session.last = now;
    session.busy = true;
    browser.tabs.sendMessage(tabId, { type: "scroll-tick", distance: session.speed * seconds * session.direction, background: session.background })
      .then(result => { if (sessions.get(tabId) === session) { session.video = result?.video || null; session.viewport = result?.viewport || session.viewport; if (result?.end) stop(tabId); } })
      .catch(() => { if (sessions.get(tabId) === session) stop(tabId); })
      .finally(() => { session.busy = false; });
  }
}, 250);

browser.tabs.onUpdated.addListener((tabId, change) => { if (change.status === "loading" || change.url) stop(tabId); });
browser.tabs.onRemoved.addListener(stop);
browser.commands.onCommand.addListener(async command => {
  if (command !== "toggle-scroll") return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const session = sessions.get(tab.id);
  if (session) { try { await togglePause(tab.id, session); } catch { stop(tab.id); } }
  else {
    try { const saved = await browser.storage.local.get("settings"); await start(tab.id, saved.settings || defaults); }
    catch { await badge(tab.id, "!"); }
  }
});
