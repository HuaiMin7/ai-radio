# MVP Baseline

This document records the current local MVP baseline before the next round of feature work.

## Current Capabilities

- React/Vite web player at `http://127.0.0.1:5173/`.
- Local Node API at `http://127.0.0.1:8788`.
- Optional NetEase local API at `http://127.0.0.1:3000`.
- OpenAI-compatible LLM adapter for Aliyun Bailian.
- Dialogue intent split:
  - normal chat returns text only.
  - recommendation mode uses `[RECOMMEND]` and `[DJ]` tags.
- Recommendation count:
  - one song when the user asks for one.
  - eight songs for "several", "some", or playlist-style requests.
  - explicit numeric requests are capped at ten songs.
- Structured taste samples in `user/playlists.json`; these infer a taste profile and are not a closed recommendation library.
- NetEase playback URL resolution with local fallback audio.
- Qwen TTS with macOS `say` fallback.
- Playback history and recommendation memory in `data/history.json`.

## Standard Local Commands

```bash
npm run dev:all
```

Starts or reuses the full local stack.

```bash
npm run dev:check
```

Checks whether the frontend, API, and NetEase API are reachable.

```bash
npm run build
```

Runs TypeScript and Vite production build checks.

## Baseline Verification

Before continuing feature work, the baseline is considered healthy when:

- `npm run build` succeeds.
- `npm run dev:check` reports all services as `[ok]`.
- `GET /api/now` returns JSON.
- `POST /api/resolve-track` returns either `source: "netease"` or a valid local fallback.
- The app opens at `http://127.0.0.1:5173/`.

## Runtime Files

These are local runtime outputs and should not be treated as source:

- `data/history.json`
- `cache/tts/`
- `cache/music/`
- `dist/`
- `node_modules/`
- `.env`
