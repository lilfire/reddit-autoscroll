(() => {
  if (globalThis.__focusFreeScroll) return;
  globalThis.__focusFreeScroll = true;
  let target;
  let edgeSince = null;
  let previousHeight = 0;
  let remainder = 0;
  let previousDirection = 0;
  let running = false;
  let speed = 0;
  let frameId = null;
  let lastFrame = null;
  let lastHeartbeat = 0;
  let waitForVideos = true;
  let videoSpeedFactor = 0.25;
  let autoImages = true;
  let waitForImages = true;
  let imageSpeedFactor = 0.25;
  let imageInterval = 3000;
  let videos = [];
  let galleries = [];
  let playerFrames = [];
  let galleryHold = null;
  let viewedGalleries = new WeakSet();
  let videosDirty = true;
  let lastVideoScan = -Infinity;
  let watched = new WeakMap();
  let hold = null;
  const frameVideos = new Map();
  const observedRoots = new WeakSet();
  const observer = new MutationObserver(() => { videosDirty = true; });

  function scanVideos() {
    const now = Date.now();
    if ((!videosDirty || now - lastVideoScan < 200) && now - lastVideoScan < 1000) return;
    videos = [];
    galleries = [];
    playerFrames = [];
    function scan(root) {
      if (!observedRoots.has(root)) {
        observer.observe(root, { childList: true, subtree: true });
        observedRoots.add(root);
      }
      videos.push(...root.querySelectorAll("video"));
      galleries.push(...root.querySelectorAll("gallery-carousel"));
      playerFrames.push(...root.querySelectorAll("iframe"));
      for (const element of root.querySelectorAll("*")) if (element.shadowRoot) scan(element.shadowRoot);
    }
    scan(document);
    videosDirty = false;
    lastVideoScan = now;
  }

  function videoVisibility(video) {
    if (video.remote) return Date.now() - video.reportAt < 2000 ? (video.ready ? 1 : video.visible ? 0.25 : 0) : 0;
    if (!video.isConnected) return 0;
    if (target !== document.scrollingElement) {
      let node = video;
      while (node && node !== target) node = node.parentNode || node.getRootNode?.().host;
      if (node !== target) return 0;
    }
    const rect = video.getBoundingClientRect();
    const clip = target === document.scrollingElement ? { top: 0, left: 0, bottom: innerHeight, right: innerWidth } : target.getBoundingClientRect();
    const height = Math.min(rect.bottom, clip.bottom, innerHeight) - Math.max(rect.top, clip.top, 0);
    const width = Math.min(rect.right, clip.right, innerWidth) - Math.max(rect.left, clip.left, 0);
    if (rect.height < 60 || rect.width < 60 || height <= 0 || width <= 0) return 0;
    const requiredHeight = Math.min(rect.height, Math.min(clip.bottom, innerHeight) - Math.max(clip.top, 0));
    const requiredWidth = Math.min(rect.width, Math.min(clip.right, innerWidth) - Math.max(clip.left, 0));
    return height >= requiredHeight - 2 && width >= requiredWidth - 2 ? 1 : 0.25;
  }

  function videoFactor() {
    if (!waitForVideos) { hold = null; return 1; }
    scanVideos();
    const now = Date.now();
    if (hold) {
      const video = hold.video;
      const source = video.currentSrc || video.src || "";
      if (source !== hold.source || !video.isConnected || videoVisibility(video) === 0) hold = null;
      else {
        const position = video.currentTime;
        const wrapped = position < hold.position - 0.5;
        if (Math.abs(position - hold.position) > 0.05) { hold.progressAt = now; hold.position = position; }
        const finished = video.ended || (Number.isFinite(video.duration) && video.duration > 0 && position >= video.duration - 0.1);
        const pausedTooLong = video.paused && now - hold.progressAt >= 5000;
        if (finished || wrapped || video.error || pausedTooLong || now - hold.progressAt >= 15000 || now - hold.startedAt >= 120000) {
          watched.set(video, source);
          hold = null;
        } else { edgeSince = null; return videoVisibility(video) === 1 ? videoSpeedFactor : 0; }
      }
    }
    for (const [key, video] of frameVideos) if (now - video.reportAt >= 2000) frameVideos.delete(key);
    for (const video of [...videos, ...frameVideos.values()]) {
      const source = video.currentSrc || video.src || "";
      if (video.ended || video.error || watched.get(video) === source || (video.paused && !video.autoplay)) continue;
      const visible = videoVisibility(video);
      if (visible === 1) {
        hold = { video, source, position: video.currentTime, startedAt: now, progressAt: now };
        edgeSince = null;
        return videoSpeedFactor;
      }
    }
    return 1;
  }

  function videoTravel(direction) {
    if (!hold) return Infinity;
    let element = hold.video;
    if (element.remote) {
      // Measure the player from the scrolling page on EVERY frame. A cached
      // IntersectionObserver report arrives too late to enforce a scroll limit.
      const matches = playerFrames.filter(frame => frame.isConnected && frame.src && frame.src.split('#')[0] === element.frameUrl?.split('#')[0]);
      if (matches.length !== 1 || !element.rect || !element.frameViewport) {
        // Unknown/nested player: never travel on a report indefinitely.
        return Math.max(0, 4 - (element.travelled || 0));
      }
      const frame = matches[0];
      const bounds = frame.getBoundingClientRect();
      const scale = bounds.height / (frame.offsetHeight || bounds.height);
      const top = bounds.top + (frame.clientTop || 0) * scale;
      const rect = element.rect;
      element = { getBoundingClientRect: () => ({ top: top + rect.top * scale, bottom: top + rect.bottom * scale }) };
    }
    return mediaTravel(element, direction);
  }

  function mediaTravel(element, direction) {
    const rect = element.getBoundingClientRect();
    const clip = target === document.scrollingElement ? { top: 0, bottom: innerHeight } : target.getBoundingClientRect();
    const distance = direction > 0 ? rect.top - Math.max(0, clip.top) : Math.min(innerHeight, clip.bottom) - rect.bottom;
    // Keep the same safety margin for videos and image carousels.
    return Math.max(0, distance - 64);
  }

  function videoStatus() {
    return hold ? { currentTime: hold.video.currentTime, duration: Number.isFinite(hold.video.duration) ? hold.video.duration : null, mode: hold.mode || "slow" } : null;
  }

  function galleryInFocus(gallery) {
    if (!gallery.isConnected || videoVisibility(gallery) !== 1) return false;
    const rect = gallery.getBoundingClientRect();
    const clip = target === document.scrollingElement ? { top: 0, left: 0, bottom: innerHeight, right: innerWidth } : target.getBoundingClientRect();
    return rect.top >= Math.max(0, clip.top) - 2 && rect.bottom <= Math.min(innerHeight, clip.bottom) + 2 &&
      rect.left >= Math.max(0, clip.left) - 2 && rect.right <= Math.min(innerWidth, clip.right) + 2;
  }

  function galleryPages(gallery) {
    return [...gallery.querySelectorAll('li[slot^="page-"]')];
  }

  function galleryNext(gallery) {
    const roots = [gallery];
    for (let i = 0; i < roots.length; i++) {
      for (const element of roots[i].querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot);
      if (i === 0 && gallery.shadowRoot) roots.push(gallery.shadowRoot);
      for (const button of roots[i].querySelectorAll('button, [role="button"]')) {
        const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${button.getAttribute('slot') || ''}`;
        if (/(\bnext\b|\bneste\b)/i.test(label) && !button.disabled && button.getAttribute('aria-disabled') !== 'true') return button;
      }
    }
    return null;
  }

  function galleryWaiting() {
    if (!autoImages) { galleryHold = null; return false; }
    scanVideos();
    const now = Date.now();
    if (galleryHold && !galleryInFocus(galleryHold.gallery)) galleryHold = null;
    if (!galleryHold) {
      const gallery = galleries.find(element => !viewedGalleries.has(element) && galleryInFocus(element) && galleryPages(element).length > 1 && galleryNext(element));
      if (!gallery) return false;
      galleryHold = { gallery, changedAt: now, startedAt: now, pendingPage: null, clickedAt: 0 };
    }
    const state = galleryHold;
    const pages = galleryPages(state.gallery);
    const current = pages.findIndex(page => page.style.visibility === 'visible');
    function finish() { viewedGalleries.add(state.gallery); galleryHold = null; return false; }
    if (current < 0 || now - state.startedAt >= Math.max(120000, pages.length * (imageInterval + 2000))) return finish();
    if (state.pendingPage !== null) {
      if (current !== state.pendingPage) { state.pendingPage = null; state.changedAt = now; }
      else if (now - state.clickedAt >= 2000) return finish();
      else return true;
    }
    if (now - state.changedAt < imageInterval) return true;
    if (current === pages.length - 1) return finish();
    const next = galleryNext(state.gallery);
    if (!next) return finish();
    state.pendingPage = current;
    state.clickedAt = now;
    next.click();
    return true;
  }

  function cancelAnimation() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    lastFrame = null;
  }

  function animate(time) {
    frameId = null;
    if (!running || document.hidden || Date.now() - lastHeartbeat > 2000) { lastFrame = null; return; }
    if (lastFrame !== null) move(speed * Math.min((time - lastFrame) / 1000, 0.05));
    lastFrame = time;
    frameId = requestAnimationFrame(animate);
  }

  function ensureAnimation() {
    if (running && !document.hidden && frameId === null) frameId = requestAnimationFrame(animate);
  }

  document.addEventListener("visibilitychange", () => {
    cancelAnimation();
    edgeSince = null;
    ensureAnimation();
  });

  function findTarget() {
    const root = document.scrollingElement;
    if (root && root.scrollHeight > root.clientHeight + 2) return root;
    let best = root;
    let largest = 0;
    for (const element of document.querySelectorAll("body *")) {
      if (element.clientHeight < 100 || element.scrollHeight <= element.clientHeight + 2) continue;
      if (!/^(auto|scroll)$/.test(getComputedStyle(element).overflowY)) continue;
      const rect = element.getBoundingClientRect();
      const area = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) * Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      if (area > largest) { largest = area; best = element; }
    }
    return best;
  }

  function move(distance) {
    if (!target || !target.isConnected) target = findTarget();
    if (!target) return { end: true };
    const galleryActive = galleryWaiting();
    const gallerySlowing = galleryActive && waitForImages;
    const factor = Math.min(videoFactor(), gallerySlowing ? imageSpeedFactor : 1);
    if (factor === 0) { if (hold) hold.mode = "waiting"; return { end: false, video: videoStatus() }; }
    distance *= factor;
    const direction = Math.sign(distance);
    const travel = Math.min(videoTravel(direction), gallerySlowing ? mediaTravel(galleryHold.gallery, direction) : Infinity);
    if (hold) hold.mode = travel <= 1 ? "waiting" : "slow";
    if (travel <= 1) { remainder = 0; edgeSince = null; return { end: false, video: videoStatus() }; }
    distance = direction * Math.min(Math.abs(distance), travel);
    if (direction !== previousDirection) { remainder = 0; edgeSince = null; previousDirection = direction; }
    remainder += distance;
    const step = direction * Math.min(Math.abs(Math.trunc(remainder)), Math.floor(travel));
    remainder -= step;
    if (step) target.scrollTo({ top: target.scrollTop + step, behavior: "instant" });
    if (hold?.video.remote) hold.video.travelled = (hold.video.travelled || 0) + Math.abs(step);
    const atEdge = direction < 0 ? target.scrollTop <= 1 : target.scrollTop + target.clientHeight >= target.scrollHeight - 1;
    if (!atEdge || target.scrollHeight !== previousHeight) edgeSince = null;
    previousHeight = target.scrollHeight;
    if (hold || galleryActive) edgeSince = null;
    else if (atEdge && edgeSince === null) edgeSince = Date.now();
    return { end: !hold && !galleryActive && edgeSince !== null && Date.now() - edgeSince >= 15000, video: videoStatus() };
  }

  browser.runtime.onMessage.addListener(message => {
    if (message.type === "frame-video-update") {
      const alive = new Set();
      for (const report of message.videos) {
        const key = `${message.frameId}:${report.id}`;
        alive.add(key);
        const video = frameVideos.get(key) || { remote: true, isConnected: true };
        Object.assign(video, report, { frameUrl: message.frameUrl, currentSrc: report.src, duration: report.duration === null ? Infinity : report.duration, reportAt: Date.now() });
        frameVideos.set(key, video);
      }
      for (const [key, video] of frameVideos) if (key.startsWith(`${message.frameId}:`) && !alive.has(key)) { video.isConnected = false; frameVideos.delete(key); }
      return Promise.resolve({ ok: true });
    }
    if (message.type === "scroll-reset") {
      running = false; cancelAnimation(); target = null; edgeSince = null; previousHeight = 0; remainder = 0; previousDirection = 0;
      hold = null; watched = new WeakMap(); videosDirty = true;
      galleryHold = null; viewedGalleries = new WeakSet();
      frameVideos.clear();
      return Promise.resolve({ ok: true });
    }
    if (message.type === "scroll-state") {
      running = message.running;
      speed = message.speed * message.direction;
      waitForVideos = message.waitForVideos !== false;
      const percent = Number(message.videoSpeedPercent ?? 25);
      videoSpeedFactor = Number.isFinite(percent) ? Math.min(100, Math.max(1, percent)) / 100 : 0.25;
      autoImages = message.autoImages !== false;
      waitForImages = message.waitForImages !== false;
      const imagePercent = Number(message.imageSpeedPercent ?? 25);
      imageSpeedFactor = Number.isFinite(imagePercent) ? Math.min(100, Math.max(1, imagePercent)) / 100 : 0.25;
      const seconds = Number(message.imageSeconds ?? 3);
      imageInterval = Number.isFinite(seconds) ? Math.min(60, Math.max(0.5, seconds)) * 1000 : 3000;
      if (!autoImages) galleryHold = null;
      if (!running) hold = null;
      if (!running) galleryHold = null;
      lastHeartbeat = Date.now();
      cancelAnimation(); ensureAnimation();
      return Promise.resolve({ ok: true });
    }
    if (message.type !== "scroll-tick") return;
    if (!running) return Promise.resolve({ end: false });
    lastHeartbeat = Date.now();
    if (!message.background && document.hidden) { edgeSince = null; return Promise.resolve({ end: false }); }
    if (document.hidden) return Promise.resolve({ ...move(message.distance), viewport: { width: innerWidth, height: innerHeight } });
    ensureAnimation();
    return Promise.resolve({ end: !hold && !galleryHold && edgeSince !== null && Date.now() - edgeSince >= 15000, video: videoStatus(), viewport: { width: innerWidth, height: innerHeight } });
  });
})();
