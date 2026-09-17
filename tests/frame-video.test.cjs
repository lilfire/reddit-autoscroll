const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('iframe reporter distinguishes partial video from fully framed video', async () => {
  let tick, intersection;
  const reports = [];
  const video = { isConnected: true, currentSrc: 'blob:https://www.redgifs.com/example', currentTime: 3, duration: 12, paused: false, autoplay: true, ended: false, getBoundingClientRect: () => ({ top: 0, bottom: 200, left: 0, right: 300 }) };
  const context = {
    window: { top: {} }, document: { querySelectorAll: selector => selector === 'video' ? [video] : [] },
    Date, innerHeight: 500, innerWidth: 800, setInterval(fn) { tick = fn; },
    IntersectionObserver: class { constructor(fn) { intersection = fn; } observe() {} unobserve() {} },
    browser: { runtime: { sendMessage: async report => { reports.push(report); return { viewport: { width: 800, height: 500 } }; } } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../frame-video.js'), 'utf8'), context);
  tick(); assert.equal(reports.at(-1).videos[0].visible, false);
  await new Promise(resolve => setImmediate(resolve));
  intersection([{ target: video, isIntersecting: true, boundingClientRect: { height: 200, width: 300 }, intersectionRect: { height: 20, width: 300 } }]);
  tick(); assert.equal(reports.at(-1).videos[0].visible, true);
  assert.equal(reports.at(-1).videos[0].ready, false);
  intersection([{ target: video, isIntersecting: true, boundingClientRect: { height: 200, width: 300 }, intersectionRect: { height: 200, width: 300 } }]);
  tick(); assert.equal(reports.at(-1).videos[0].ready, true);
  assert.equal(reports.at(-1).videos[0].src, video.currentSrc);
  video.currentTime = 0.1; tick(); assert.equal(reports.at(-1).videos[0].currentTime, 0.1);
  video.isConnected = false; tick(); assert.equal(reports.at(-1).videos.length, 0);
});

test('reporter does not run in the top frame', () => {
  const window = {}; window.top = window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../frame-video.js'), 'utf8'), { window });
});
