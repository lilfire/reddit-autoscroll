const speed = document.getElementById("speed");
const direction = document.getElementById("direction");
const background = document.getElementById("background");
const videos = document.getElementById("videos");
const videoSpeed = document.getElementById("video-speed");
const images = document.getElementById("images");
const waitImages = document.getElementById("wait-images");
const imageSpeed = document.getElementById("image-speed");
const imageSeconds = document.getElementById("image-seconds");
const status = document.getElementById("status");
const pause = document.getElementById("pause");
const stop = document.getElementById("stop");

async function control(action, restore = false) {
  try {
    const result = await browser.runtime.sendMessage({ type: "control", action, settings: { speed: Number(speed.value), direction: Number(direction.value), background: background.checked, waitForVideos: videos.checked, videoSpeedPercent: Number(videoSpeed.value), autoImages: images.checked, waitForImages: waitImages.checked, imageSpeedPercent: Number(imageSpeed.value), imageSeconds: Number(imageSeconds.value) } });
    if (result.error) throw new Error(result.error);
    if (restore) { speed.value = result.settings.speed; direction.value = result.settings.direction; background.checked = result.settings.background; videos.checked = result.settings.waitForVideos !== false; videoSpeed.value = result.settings.videoSpeedPercent ?? 25; }
    if (restore) { images.checked = result.settings.autoImages !== false; imageSpeed.value = result.settings.imageSpeedPercent ?? 25; imageSeconds.value = result.settings.imageSeconds ?? 3; }
    if (restore) waitImages.checked = result.settings.waitForImages !== false;
    status.textContent = { running: "Scroller", paused: "På pause", stopped: "Stoppet" }[result.status];
    if (result.status === "running" && result.video) status.textContent = `${result.video.mode === "waiting" ? "Venter på video" : "Scroller sakte for video"}: ${Math.floor(result.video.currentTime)} s${result.video.duration === null ? "" : ` / ${Math.ceil(result.video.duration)} s`}`;
    pause.textContent = result.status === "paused" ? "Fortsett" : "Pause";
    pause.disabled = stop.disabled = result.status === "stopped";
  } catch (error) { status.textContent = `Kan ikke scrolle denne siden: ${error.message}`; }
}
document.getElementById("controls").addEventListener("submit", event => { event.preventDefault(); void control("start"); });
pause.addEventListener("click", () => void control("pause"));
stop.addEventListener("click", () => void control("stop"));
void control("status", true);
setInterval(() => void control("status"), 1000);
