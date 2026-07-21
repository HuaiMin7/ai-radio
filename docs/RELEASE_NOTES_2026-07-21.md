# Redio 2.0 baseline release notes

Date: 2026-07-21

Release branch: `codex/multi-source-login-fallback`

## Product and UI

- Rebuilt the primary experience around the Redio 2.0 home player, queue carousel, account menu, and responsive starfield layout.
- Added the floating Ask Anything entry and Figma-aligned chat panel, including history loading, recommendation cards, user/DJ avatars, and stable bubble alignment.
- Added the Redio Agent profile page with taste tags, listener statistics, identity copy, and QQ login state.
- Moved playback memory, QQ source authorization, and runtime logs into the dedicated settings page.
- Added the QQ account menu, logout entry, login modal, and desktop/browser authorization guidance.

## QQ playback and Bridge

- Added Redio Bridge v0.1.4 for reading the QQ Music official web login state and syncing only required playback cookies to the local API.
- Added Bridge detection, official login launch, automatic status polling, manual refresh, playback warmup, update guidance, and downloadable extension package.
- Improved QQ search matching, playback URL quality fallback, cover URL and lyrics metadata, audio proxying, and explicit playback failure reporting.
- Kept cookies local and excluded them from source control. Bridge diagnostics now expose only the approved QQ login/playback cookie names.

## AI, DJ, and playback flow

- Separated ordinary chat from music requests. Explicit no-music messages stay in chat mode, while positive requests such as "推荐一些不要太吵的歌" still trigger recommendations.
- Kept the one-song versus eight-song request behavior and personalized recommendation context.
- Set model-written DJ copy to 60-100 Chinese characters with a hard 100-character cap.
- Preserved simultaneous DJ and song playback, 50% music ducking with fade transitions, per-track DJ intros, automatic next-track playback, and a 200-track queue cap.
- Fixed manual progress seeking by handling range input events continuously.
- Restored the DJ avatar entry from the landing chat panel to the Agent profile page.

## Validation completed

- `npm run build`
- `npm run dev:check`
- Browser checks for home, navigation, account menu, chat, Agent profile, settings panels, avatars, playback, pause, next track, DJ playback, and progress seeking.
- Real QQ Music login, search, full-track resolution, cover/lyrics metadata, and ranged audio proxy response.
- API success/error contracts, CORS rejection, audio-proxy SSRF rejection, and queue/history/feedback capacity limits.
- Desktop Electron startup smoke test.
- Bridge script syntax, Manifest V3 structure, ZIP integrity, and source/archive equality checks.

## Known non-blocking item

- Vite reports a production bundle chunk above 500 kB. The build succeeds; code splitting remains a later performance task.
