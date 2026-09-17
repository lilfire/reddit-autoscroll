// Only embedded Redgifs players report playback. The background script verifies
// the extension sender before forwarding reports to the scrolling top frame.
(() => {
  if (window === window.top) return;
  const tracked = new Map();
  let nextId = 0;
  let viewport = null;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const item = tracked.get(entry.target);
      if (item) item.entry = entry;
    }
  }, { threshold: Array.from({ length: 201 }, (_, index) => index / 200) });
  function discover(root) {
    for (const video of root.querySelectorAll("video")) {
      if (!tracked.has(video)) { tracked.set(video, { id: ++nextId, visible: false }); observer.observe(video); }
    }
    for (const element of root.querySelectorAll("*")) if (element.shadowRoot) discover(element.shadowRoot);
  }
  let lastScan = -Infinity;
  setInterval(() => {
    if (Date.now() - lastScan >= 1000) { discover(document); lastScan = Date.now(); }
    const videos = [];
    for (const [video, item] of tracked) {
      if (!video.isConnected) { observer.unobserve(video); tracked.delete(video); continue; }
      const entry = item.entry;
      const visible = Boolean(entry?.isIntersecting && entry.intersectionRect.height > 0 && entry.intersectionRect.width > 0);
      const bounds = entry?.boundingClientRect;
      const ready = Boolean(visible && bounds && viewport &&
        entry.intersectionRect.height >= Math.min(bounds.height, innerHeight, viewport.height) - 2 &&
        entry.intersectionRect.width >= Math.min(bounds.width, innerWidth, viewport.width) - 2);
      const rect = video.getBoundingClientRect();
      videos.push({ id: item.id, visible, ready, rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }, frameViewport: { width: innerWidth, height: innerHeight }, src: video.currentSrc || video.src, currentTime: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : null, paused: video.paused, ended: video.ended, autoplay: video.autoplay, error: Boolean(video.error) });
    }
    void browser.runtime.sendMessage({ type: "frame-video-report", videos }).then(result => { if (result?.viewport) viewport = result.viewport; }).catch(() => {});
  }, 50);
})();
