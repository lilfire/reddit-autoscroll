const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
  let listener, now = 0;
  let visibility;
  let nextFrame = 0;
  let mutation;
  const videoElements = [];
  const galleryElements = [];
  const playerFrames = [];
  const frames = new Map();
  const root = { scrollTop: 0, scrollHeight: 2000, clientHeight: 500, isConnected: true,
    scrollTo({ top }) { this.scrollTop = Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight)); } };
  const document = { scrollingElement: root, hidden: true, shadowHosts: [], querySelectorAll(selector) { return selector === 'video' ? videoElements : selector === 'gallery-carousel' ? galleryElements : selector === 'iframe' ? playerFrames : this.shadowHosts; }, addEventListener(type, fn) { visibility = fn; } };
  const context = vm.createContext({ document, innerWidth: 800, innerHeight: 500, MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} }, Date: { now: () => now }, requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; }, cancelAnimationFrame(id) { frames.delete(id); }, browser: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } } });
  const source = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');
  vm.runInContext(source, context);
  listener({ type: 'scroll-state', running: true, speed: 80, direction: 1 });
  return { root, document, tick: (distance, background = true) => listener({ type: 'scroll-tick', distance, background }), time: value => { now = value; }, reset: () => listener({ type: 'scroll-reset' }), reinject: () => vm.runInContext(source, context),
    state: (running, speed = 80, waitForVideos = true, videoSpeedPercent = 25, imageSettings = {}) => listener({ type: 'scroll-state', running, speed, direction: 1, waitForVideos, videoSpeedPercent, ...imageSettings }),
    report: (videos, frameId = 7, frameUrl) => listener({ type: 'frame-video-update', frameId, frameUrl, videos }),
    addFrame(src, top) { const frame = { src, isConnected: true, offsetHeight: 200, clientTop: 0, getBoundingClientRect() { return { top: top - root.scrollTop, height: 200 }; } }; playerFrames.push(frame); mutation(); return frame; },
    addGallery(top = 30, responds = true) {
      const pages = Array.from({ length: 3 }, (_, i) => ({ style: { visibility: i === 0 ? 'visible' : 'hidden' } }));
      const gallery = { isConnected: true, top, clicks: 0,
        getBoundingClientRect() { const y = this.top - root.scrollTop; return { top: y, bottom: y + 200, left: 100, right: 500, width: 400, height: 200 }; },
        querySelectorAll(selector) { return selector.startsWith('li') ? pages : []; },
        shadowRoot: { querySelectorAll(selector) { return selector === '*' ? [] : [button]; } } };
      const button = { getAttribute(name) { return name === 'aria-label' ? 'Next image' : null; }, click() {
        gallery.clicks++;
        if (!responds) return;
        const index = pages.findIndex(page => page.style.visibility === 'visible');
        pages[index].style.visibility = 'hidden'; pages[(index + 1) % pages.length].style.visibility = 'visible';
      } };
      galleryElements.push(gallery); mutation(); return gallery;
    },
    addVideo(options = {}) {
      const video = { isConnected: true, paused: false, ended: false, autoplay: true, currentTime: 1, duration: 10, currentSrc: 'movie.mp4', top: 0,
        getBoundingClientRect() { const top = this.top - root.scrollTop; return { top, bottom: top + 200, left: 100, right: 500, width: 400, height: 200 }; }, ...options };
      videoElements.push(video); mutation(); return video;
    },
    visible(value) { document.hidden = !value; visibility(); },
    frame(time) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); },
    frameCount: () => frames.size };
}

test('visible scrolling uses frames without heartbeat jumps; pause cancels frames', async () => {
  const s = setup(); s.visible(true); await s.state(true);
  s.frame(0);
  for (let time = 10; time <= 250; time += 10) s.frame(time);
  assert.equal(s.root.scrollTop, 20);
  await s.tick(20); assert.equal(s.root.scrollTop, 20);
  await s.state(false); s.frame(260); assert.equal(s.root.scrollTop, 20);
  assert.equal(s.frameCount(), 0);
});

test('newly inserted playing video holds scrolling and resumes on completion', async () => {
  const s = setup(); await s.tick(20); assert.equal(s.root.scrollTop, 20);
  const video = s.addVideo({ top: 20 }); s.time(250);
  const result = await s.tick(20);
  assert.equal(s.root.scrollTop, 20); assert.equal(result.video.currentTime, 1);
  video.currentTime = 5; s.time(500); await s.tick(20); assert.equal(s.root.scrollTop, 20);
  video.currentTime = 10; video.ended = true; s.time(750);
  await s.tick(20); assert.equal(s.root.scrollTop, 40);
  video.ended = false; video.currentTime = 0;
  await s.tick(20); assert.equal(s.root.scrollTop, 60);
});

test('partially visible and offscreen videos retain normal speed', async () => {
  const s = setup(); const video = s.addVideo({ top: 450 });
  await s.tick(20); assert.equal(s.root.scrollTop, 20);
  video.top = 1000; await s.tick(20); assert.equal(s.root.scrollTop, 40);
});

test('video loop wraps, stalls and autoplay failure cannot trap scrolling', async () => {
  const loop = setup(); const video = loop.addVideo({ currentTime: 8, loop: true });
  await loop.tick(20); video.currentTime = 0.1; await loop.tick(20);
  assert.equal(loop.root.scrollTop, 20);
  const stalled = setup(); stalled.addVideo(); await stalled.tick(20);
  stalled.time(15000); await stalled.tick(20); assert.equal(stalled.root.scrollTop, 20);
  const blocked = setup(); blocked.addVideo({ paused: true, currentTime: 0 }); await blocked.tick(20);
  blocked.time(5000); await blocked.tick(20); assert.equal(blocked.root.scrollTop, 20);
});

test('video wait has a two-minute limit even while playback advances', async () => {
  const s = setup(); const video = s.addVideo({ duration: Infinity }); await s.tick(20);
  for (let time = 10000; time < 120000; time += 10000) {
    s.time(time); video.currentTime = time / 1000; await s.tick(20); assert.equal(s.root.scrollTop, 0);
  }
  s.time(120000); video.currentTime = 120; await s.tick(20); assert.equal(s.root.scrollTop, 20);
});

test('removed videos release scrolling and video waiting can be disabled', async () => {
  const s = setup(); const video = s.addVideo(); await s.tick(20);
  video.isConnected = false; await s.tick(20); assert.equal(s.root.scrollTop, 20);
  video.isConnected = true; await s.state(true, 80, false); await s.tick(20); assert.equal(s.root.scrollTop, 40);
});

test('visible animation pauses for videos without stopping its frame loop', async () => {
  const s = setup(); const video = s.addVideo(); s.visible(true); await s.state(true);
  s.frame(0); s.frame(50); assert.equal(s.root.scrollTop, 0); assert.equal(s.frameCount(), 1);
  video.ended = true; s.frame(100); assert.equal(s.root.scrollTop, 4);
});

test('discovers videos inside an open shadow root', async () => {
  const s = setup(); const video = s.addVideo();
  s.document.querySelectorAll = selector => selector === '*' ? s.document.shadowHosts : [];
  s.document.shadowHosts.push({ shadowRoot: { querySelectorAll(selector) { return selector === 'video' ? [video] : []; } } });
  const result = await s.tick(20); assert.equal(s.root.scrollTop, 0); assert.equal(result.video.currentTime, 1);
});

test('gallery advances only when fully visible, scrolls slowly and resumes after the last', async () => {
  const s = setup(); const gallery = s.addGallery(450);
  await s.tick(20); assert.equal(s.root.scrollTop, 20); assert.equal(gallery.clicks, 0);
  gallery.top = 150;
  await s.tick(20); assert.equal(s.root.scrollTop, 25);
  s.time(2999); await s.tick(20); assert.equal(gallery.clicks, 0);
  s.time(3000); await s.tick(20); assert.equal(gallery.clicks, 1);
  await s.tick(20);
  s.time(6000); await s.tick(20); assert.equal(gallery.clicks, 2);
  await s.tick(20);
  s.time(9000); await s.tick(20); assert.equal(s.root.scrollTop, 70);
  await s.tick(20); assert.equal(s.root.scrollTop, 90); assert.equal(gallery.clicks, 2);
});

test('unresponsive or removed gallery releases scrolling', async () => {
  const s = setup(); const gallery = s.addGallery(100, false);
  await s.tick(20); s.time(3000); await s.tick(20);
  s.time(5000); await s.tick(20); assert.equal(s.root.scrollTop, 30); assert.equal(gallery.clicks, 1);
  const removed = setup(); const other = removed.addGallery(100); await removed.tick(20);
  other.isConnected = false; await removed.tick(20); assert.equal(removed.root.scrollTop, 25);
});

test('fast scrolling preserves a 64px gallery margin until all images have been shown', async () => {
  const s = setup(); const gallery = s.addGallery(100);
  await s.tick(20); assert.equal(s.root.scrollTop, 5);
  await s.tick(1000); assert.equal(s.root.scrollTop, 36);
  s.time(3000); await s.tick(20); assert.equal(gallery.clicks, 1); assert.equal(s.root.scrollTop, 36);
  await s.tick(20);
  s.time(6000); await s.tick(20); assert.equal(gallery.clicks, 2); assert.equal(s.root.scrollTop, 36);
  await s.tick(20);
  s.time(9000); await s.tick(20); assert.equal(s.root.scrollTop, 56);
});

test('upward gallery scrolling slows and stops before leaving the viewport', async () => {
  const s = setup(); s.root.scrollTop = 100; s.addGallery(300);
  await s.tick(-20); assert.equal(s.root.scrollTop, 95);
  await s.tick(-1000); assert.equal(s.root.scrollTop, 64);
  await s.tick(-20); assert.equal(s.root.scrollTop, 64);
});

test('image settings control speed, interval and disabling an active carousel', async () => {
  const s = setup(); const gallery = s.addGallery(200);
  await s.state(true, 80, true, 25, { imageSpeedPercent: 50, imageSeconds: 5 });
  await s.tick(20); assert.equal(s.root.scrollTop, 10);
  s.time(3000); await s.tick(20); assert.equal(gallery.clicks, 0);
  s.time(5000); await s.tick(20); assert.equal(gallery.clicks, 1);
  await s.state(true, 80, true, 25, { autoImages: false });
  s.time(10000); await s.tick(20); assert.equal(s.root.scrollTop, 50); assert.equal(gallery.clicks, 1);
});

test('image waiting can be disabled while automatic image switching continues', async () => {
  const s = setup(); const gallery = s.addGallery(200);
  await s.tick(20); assert.equal(s.root.scrollTop, 5);
  await s.state(true, 80, true, 25, { waitForImages: false });
  s.time(3000); await s.tick(20);
  assert.equal(gallery.clicks, 1); assert.equal(s.root.scrollTop, 25);
  await s.tick(1000); assert.equal(s.root.scrollTop, 1025);
});

test('looping blob video with supplied attributes is held until a loop completes', async () => {
  const s = setup();
  const video = s.addVideo({ currentSrc: 'blob:https://www.redgifs.com/28236f6d-8773-4018-bf77-9351825ad360', autoplay: true, loop: true, playsInline: true, currentTime: 3 });
  await s.tick(20); assert.equal(s.root.scrollTop, 0);
  video.currentTime = 8; await s.tick(20); assert.equal(s.root.scrollTop, 0);
  video.currentTime = 0.2; await s.tick(20); assert.equal(s.root.scrollTop, 20);
});

test('embedded Redgifs playback reports hold the parent page and release at loop wrap', async () => {
  const s = setup();
  const report = { id: 1, visible: true, ready: true, src: 'blob:https://www.redgifs.com/movie', autoplay: true, paused: false, ended: false, currentTime: 3, duration: 10 };
  await s.report([report]); await s.tick(20); assert.equal(s.root.scrollTop, 4);
  s.time(250); await s.report([{ ...report, ready: false, currentTime: 8 }]); await s.tick(20); assert.equal(s.root.scrollTop, 4);
  s.time(500); await s.report([{ ...report, ready: false, currentTime: 0.1 }]); await s.tick(20); assert.equal(s.root.scrollTop, 24);
});

test('offscreen and stale iframe reports cannot hold scrolling', async () => {
  const s = setup();
  const report = { id: 1, visible: false, src: 'blob:movie', autoplay: true, paused: false, currentTime: 3, duration: 10 };
  await s.report([report]); await s.tick(20); assert.equal(s.root.scrollTop, 20);
  await s.report([{ ...report, visible: true, ready: true }]); await s.tick(20); assert.equal(s.root.scrollTop, 24);
  s.time(2500); await s.tick(20); assert.equal(s.root.scrollTop, 44);
});

test('starts slowing only once the entire video is framed', async () => {
  const s = setup(); const video = s.addVideo({ top: 480 });
  await s.tick(20); assert.equal(s.root.scrollTop, 20);
  video.top = 420; await s.tick(20); assert.equal(s.root.scrollTop, 40);
  video.top = 340; await s.tick(20); assert.equal(s.root.scrollTop, 45);
});

test('oversized video holds when it fills the viewport', async () => {
  const s = setup(); s.addVideo({ getBoundingClientRect() { return { top: -100, bottom: 700, left: 100, right: 500, width: 400, height: 800 }; } });
  await s.tick(20); assert.equal(s.root.scrollTop, 0);
});

test('embedded player begins slowing at full-frame report', async () => {
  const s = setup(); const report = { id: 1, visible: true, ready: false, src: 'blob:movie', autoplay: true, paused: false, currentTime: 3, duration: 10 };
  await s.report([report]); await s.tick(20); assert.equal(s.root.scrollTop, 20);
  await s.report([{ ...report, ready: true }]); await s.tick(20); assert.equal(s.root.scrollTop, 24);
  await s.report([report]); const result = await s.tick(20); assert.equal(s.root.scrollTop, 24); assert.equal(result.video.mode, 'waiting');
});

test('fully framed video scrolls slowly, stops at the viewport edge and resumes when finished', async () => {
  const s = setup(); const video = s.addVideo({ top: 100 });
  assert.equal((await s.tick(20)).video.mode, 'slow'); assert.equal(s.root.scrollTop, 5);
  await s.tick(1000); assert.equal(s.root.scrollTop, 36);
  assert.equal((await s.tick(20)).video.mode, 'waiting'); assert.equal(s.root.scrollTop, 36);
  assert.equal(video.getBoundingClientRect().top, 64);
  video.ended = true; await s.tick(20); assert.equal(s.root.scrollTop, 56);
});

test('completion before reaching the edge resumes normal speed without a stop', async () => {
  const s = setup(); const video = s.addVideo({ top: 100 });
  await s.tick(20); assert.equal(s.root.scrollTop, 5);
  video.ended = true; await s.tick(20); assert.equal(s.root.scrollTop, 25);
});

test('custom video speed applies to local and embedded videos while preserving the stop margin', async () => {
  const local = setup(); local.addVideo({ top: 100 }); await local.state(true, 80, true, 50);
  await local.tick(20); assert.equal(local.root.scrollTop, 10);
  await local.tick(1000); assert.equal(local.root.scrollTop, 36);
  const embedded = setup(); const url = 'https://www.redgifs.com/ifr/custom'; embedded.addFrame(url, 100);
  await embedded.state(true, 80, true, 10);
  await embedded.report([{ id: 1, ready: true, visible: true, src: 'blob:movie', paused: false, currentTime: 1, duration: 10, rect: { top: 0, bottom: 200 }, frameViewport: { width: 400, height: 200 } }], 7, url);
  await embedded.tick(20); assert.equal(embedded.root.scrollTop, 2);
});

test('upward scrolling also slows and caps movement before the video leaves view', async () => {
  const s = setup(); s.root.scrollTop = 100; const video = s.addVideo({ top: 300 });
  await s.tick(-20); assert.equal(s.root.scrollTop, 95);
  await s.tick(-1000); assert.equal(s.root.scrollTop, 64);
  await s.tick(-20); assert.equal(s.root.scrollTop, 64);
  video.ended = true; await s.tick(-20); assert.equal(s.root.scrollTop, 44);
});

test('embedded player uses live iframe geometry even with a delayed full visibility report', async () => {
  const s = setup(); const url = 'https://www.redgifs.com/ifr/example'; s.addFrame(url, 100);
  const report = { id: 1, visible: true, ready: true, src: 'blob:movie', autoplay: true, paused: false, currentTime: 3, duration: 10, rect: { top: 0, bottom: 200 }, frameViewport: { width: 400, height: 200 } };
  await s.report([report], 7, url);
  await s.tick(20); assert.equal(s.root.scrollTop, 5);
  await s.tick(1000); assert.equal(s.root.scrollTop, 36);
  // No fresh intersection report: the cached report still incorrectly says ready.
  const result = await s.tick(1000); assert.equal(s.root.scrollTop, 36); assert.equal(result.video.mode, 'waiting');
  s.time(250); await s.report([{ ...report, ended: true }], 7, url);
  await s.tick(20); assert.equal(s.root.scrollTop, 56);
});

test('autoplay video temporarily paused after previous playback receives a grace period', async () => {
  const s = setup(); const video = s.addVideo({ paused: true, currentTime: 2 });
  await s.tick(20); assert.equal(s.root.scrollTop, 0);
  video.paused = false; video.currentTime = 3; s.time(250); await s.tick(20); assert.equal(s.root.scrollTop, 0);
});

test('switching visibility does not accumulate a large animation jump', async () => {
  const s = setup(); s.visible(true); await s.state(true); s.frame(0); s.frame(50);
  s.visible(false); await s.tick(20); assert.equal(s.root.scrollTop, 24);
  s.time(1000); s.visible(true); s.frame(1000); assert.equal(s.root.scrollTop, 24);
  s.frame(1050); assert.equal(s.root.scrollTop, 28);
});

test('frame loop caps long stalls and stops after heartbeat loss', async () => {
  const s = setup(); s.visible(true); await s.state(true); s.frame(0); s.frame(1000);
  assert.equal(s.root.scrollTop, 4);
  s.frame(2500); assert.equal(s.root.scrollTop, 4); assert.equal(s.frameCount(), 0);
});

test('scrolls a hidden document and retains fractional distance', () => {
  const s = setup(); s.document.hidden = true;
  for (let i = 0; i < 4; i++) s.tick(0.25);
  assert.equal(s.root.scrollTop, 1);
  s.tick(40); assert.equal(s.root.scrollTop, 41);
});
test('hidden-tab opt-out and reverse scrolling', () => {
  const s = setup(); s.root.scrollTop = 100; s.document.hidden = true;
  s.tick(20, false); assert.equal(s.root.scrollTop, 100);
  s.tick(-20); assert.equal(s.root.scrollTop, 80);
  s.state(false); s.tick(20); assert.equal(s.root.scrollTop, 80);
});
test('waits for lazy-loaded content and resets the edge deadline', async () => {
  const s = setup(); s.root.scrollTop = 1500;
  assert.equal((await s.tick(20)).end, false);
  s.time(14000); assert.equal((await s.tick(20)).end, false);
  s.root.scrollHeight = 2200;
  assert.equal((await s.tick(20)).end, false);
  s.root.scrollTop = 1700; s.time(15000); assert.equal((await s.tick(20)).end, false);
  s.time(30000); assert.equal((await s.tick(20)).end, true);
  await s.reset(); await s.state(true); assert.equal((await s.tick(20)).end, false);
});
test('reinjection does not reset an existing session', () => {
  const s = setup(); s.tick(.5); s.reinject(); s.tick(.5);
  assert.equal(s.root.scrollTop, 1);
});

test('background controls, delayed ticks, pause and navigation', async () => {
  let handler, timer, updated, now = 0;
  const messages = [];
  const browser = {
    browserAction: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { onMessage: { addListener(fn) { handler = fn; } } },
    tabs: { query: async () => [{ id: 1 }], executeScript: async () => {}, sendMessage: async (id, message) => { messages.push(message); return { end: false }; }, onUpdated: { addListener(fn) { updated = fn; } }, onRemoved: { addListener() {} } },
    commands: { onCommand: { addListener() {} } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8'), { browser, URL, Date: { now: () => now }, setInterval(fn) { timer = fn; } });
  const control = (action, settings = { speed: 80 }) => handler({ type: 'control', action, settings });
  assert.equal((await control('start', { speed: -1 })).error.length > 0, true);
  assert.match((await control('start', { speed: 80, imageSpeedPercent: 0 })).error, /Bildehastigheten/);
  assert.match((await control('start', { speed: 80, imageSeconds: 0 })).error, /Sekunder per bilde/);
  await control('start', { speed: 80, autoImages: false, waitForImages: false, imageSpeedPercent: 40, imageSeconds: 5 });
  assert.equal(messages.at(-1).autoImages, false);
  assert.equal(messages.at(-1).waitForImages, false);
  assert.equal(messages.at(-1).imageSpeedPercent, 40);
  assert.equal(messages.at(-1).imageSeconds, 5);
  assert.equal(messages.at(-1).waitForImages, false);
  await control('pause');
  await control('pause');
  assert.equal(messages.at(-1).imageSeconds, 5);
  assert.equal((await control('start')).status, 'running');
  await handler({ type: 'frame-video-report', videos: [] }, { tab: { id: 1 }, frameId: 7, url: 'https://www.redgifs.com/ifr/example' });
  assert.equal(messages.at(-1).type, 'frame-video-update');
  const routed = messages.length;
  await handler({ type: 'frame-video-report', videos: [] }, { tab: { id: 1 }, frameId: 7, url: 'https://unrelated.example/' });
  assert.equal(messages.length, routed);
  now = 10000; timer(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.at(-1).distance, 160);
  await control('pause'); const count = messages.length; timer(); assert.equal(messages.length, count);
  assert.equal((await control('pause')).status, 'running');
  updated(1, { status: 'loading' }); assert.equal((await control('status')).status, 'stopped');
});
