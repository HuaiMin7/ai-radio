# MVP Baseline

This document records the current local MVP baseline before the next round of feature work.

## Current Capabilities

- React/Vite web player at `http://127.0.0.1:5173/`.
- Local Node API at `http://127.0.0.1:8788`.
- Optional legacy NetEase local API at `http://127.0.0.1:3000`, only when `AI_RADIO_ENABLE_NETEASE_SERVICE=1`.
- OpenAI-compatible LLM adapter for Aliyun Bailian.
- Dialogue intent split:
  - normal chat returns text only.
  - recommendation mode returns structured JSON with `say` and per-track `intro` fields.
- Recommendation count:
  - one song when the user asks for one.
  - eight songs for "several", "some", or playlist-style requests.
  - explicit numeric requests are capped at ten songs.
- Structured taste samples in `user/playlists.json`; these infer a taste profile and are not a closed recommendation library.
- QQ Music playback URL resolution using local login Cookie when available.
- Redio Bridge browser extension and desktop login window can sync the local QQ Music session.
- Legacy NetEase playback URL resolution remains available only behind explicit env flags.
- Local fallback audio remains available as an explicit test provider and for the legacy NetEase path; QQ failures stay visible as failures.
- Qwen TTS with macOS `say` fallback.
- One DJ intro per track, targeting 60-100 Chinese characters with a 100-character cap.
- DJ speech plays over the song while music ramps to 50% volume, then restores.
- Playback history and recommendation memory in `data/history.json`.

## Standard Local Commands

```bash
npm run dev:all
```

Starts or reuses the full local stack.

```bash
npm run dev:check
```

Checks whether the frontend and API are reachable. NetEase is included only when `AI_RADIO_ENABLE_NETEASE_SERVICE=1`.

```bash
npm run build
```

Runs TypeScript and Vite production build checks.

## Baseline Verification

Before continuing feature work, the baseline is considered healthy when:

- `npm run build` succeeds.
- `npm run dev:check` reports enabled services as `[ok]`.
- `GET /api/now` returns JSON.
- `GET /api/qq/login/status` returns JSON.
- `POST /api/resolve-track` returns `source: "qq"` with `playbackStatus: "full"` when the local QQ session can resolve a playable song, or an explicit `failed` result when it cannot.
- The app opens at `http://127.0.0.1:5173/`.

## Runtime Files

These are local runtime outputs and should not be treated as source:

- `data/history.json`
- `data/queue.json`
- `data/feedback.json`
- `data/qq-cookie.txt`
- `cache/tts/`
- `cache/music/`
- `dist/`
- `node_modules/`
- `.env`
