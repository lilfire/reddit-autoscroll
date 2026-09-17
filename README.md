# Scroll Without Focus

A Firefox extension that automatically scrolls a selected tab without taking mouse or keyboard focus.

## Local installation

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Select **Load Temporary Add-on** and open `manifest.json` from this folder.
3. Open a regular website, click the extension icon, and select **Start / oppdater** (Start / update).
4. Switch tabs or use another application. Scrolling continues while Firefox is running and the page remains loaded.

A temporary installation is removed when Firefox closes. A ZIP file in `dist`, when available, is the source package for Mozilla signing. Standard Firefox requires signing for permanent installation.

The extension interface currently uses Norwegian labels. Their English meanings are included below where relevant.

## Behavior

- A toolbar at the top of the page shows session status. Pause/resume and stop control that tab. **Skip wait** skips the current video or image carousel for the rest of the session; new media are still waited for. The toolbar remains while paused and disappears when stopped.
- Scroll speed ranges from 1 to 2000 pixels per second, upward or downward.
- **Alt+Shift+S** starts or pauses the selected tab within Firefox.
- Multiple tabs can run separate sessions. The popup shows the selected tab's status.
- Select **Start / oppdater** to apply and save settings.
- Visible pages use `requestAnimationFrame`, synchronized with display refreshes, even when another application has focus. Animation delays are capped at 50 ms to avoid jumps.
- Hidden tabs receive background scroll signals every 250 ms. Delays produce at most two seconds of scrolling per signal. Visible pages treat these signals as heartbeats without extra scroll steps.
- **Fortsett i skjulte faner** (Continue in hidden tabs) can be disabled. Losing window focus alone does not pause scrolling.
- Navigation, closing the tab, and restarting Firefox stop the session. Speed settings are saved.
- At the top or bottom, the extension waits 15 seconds for new content before stopping.
- The full page is preferred; otherwise, the largest visible scrollable area is selected.

### Image carousels

Reddit image carousels (`gallery-carousel`) automatically advance when the entire carousel is visible within the scroll area, with a two-pixel tolerance.

**Vent på bilder** (Wait for images) is enabled by default. Disabling it keeps normal scroll speed without waiting for the carousel; automatic image advancement can remain enabled independently. The popup lets you toggle advancement, choose 1-100% of normal scroll speed, and set 0.5-60 seconds per image. Defaults are advancement enabled, 25% speed, and three seconds per image.

Scrolling pauses only if the carousel reaches the edge of the scroll area before all images have been displayed. Normal speed returns after the last image. Reddit's own next buttons are used, including those in open shadow DOM trees. Each carousel is shown once per scroll session.

Waiting ends if the next button fails, the carousel is removed, or it leaves view. The maximum wait is at least two minutes and increases for carousels with longer total display times. Image waiting works independently of video waiting.

### Videos

**Vent på videoer** (Wait for videos) is enabled by default. New HTML videos are detected, including those in open shadow DOM trees. Normal speed continues until the entire video is visible, with a two-pixel tolerance. Scrolling then uses the configured video speed: 1-100% of normal speed, with a default of 25%. For example, 80 pixels per second with 50% video speed produces 40 pixels per second while viewing a video.

If playback is unfinished, scrolling pauses with a 64-pixel safety margin from the edge of the scroll area. This margin applies at every video speed. Completed videos restore normal speed immediately. Videos larger than the scroll area pause scrolling when they fill the available visible area.

Redgifs iframes report playback and video geometry every 50 ms. The outer scroll engine measures player position on every animation frame and directly limits scroll distance. Players that cannot be reliably matched to an iframe allow at most four pixels of slow scrolling before waiting. The popup shows playback time and whether scrolling is slowed or waiting.

Reddit videos and GIFs in `shreddit-player` without autoplay start muted when fully visible and video waiting is enabled. They use the same speed, safety margin, and waiting behavior as other videos. This requires access to the player's HTML video, including through open shadow DOM trees.

Looping videos are released after one cycle. Waiting also ends on an error, removal, five seconds of paused playback, 15 seconds without progress, or a maximum of two minutes per video. If the browser blocks playback, scrolling resumes after the timeout. Completed or timed-out videos are not waited for again until a new session starts or the video source changes.

Embedded Redgifs players use a dedicated content script in the player iframe to report playback and actual visibility. This requires site permission for `redgifs.com` and its subdomains. Blob videos work without access to the video file itself. Other iframe players and closed shadow DOM are unsupported.

## Limitations

Internal Firefox pages, Mozilla Add-ons, and other protected pages do not allow content scripts.

Firefox and the operating system may throttle execution when the window is minimized or the tab is hidden. Websites may also stop loading new content while hidden. Smooth background animation, scrolling in unloaded tabs, and execution during system sleep cannot be guaranteed.

The extension uses Manifest V2 for a persistent Firefox background page and is designed for Firefox.

## Verification

Run `node --test tests/*.test.cjs`. The tests simulate browser APIs and scroll areas; they do not replace testing in Firefox.

For manual testing in Firefox:

1. Start scrolling on a long page, switch tabs for 30 seconds, and confirm the scroll position changes.
2. Repeat with another application focused and with Firefox minimized.
3. Try pause, resume, stop, navigation, and a Reddit feed that loads new posts.
4. Check a scrollable area within a page and a protected page.
5. Confirm that a new autoplay video stays in view, the popup shows playback progress, scrolling resumes when playback ends, and video waiting can be disabled. Also try a looping video and blocked autoplay.
