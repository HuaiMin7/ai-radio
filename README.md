# AI Radio

Personal AI radio prototype inspired by Claudio FM.

## Goal

Build a local-first AI DJ that reads personal taste files, plans a radio segment,
generates per-track DJ speech, and plays verified music sources continuously.

## First Milestone

1. Read user profile files from `user/`.
2. Build a prompt from profile, recent playback state, and runtime context.
3. Ask an LLM for a structured DJ decision.
4. Generate/cached TTS audio for the DJ speech.
5. Serve a web player that mixes DJ speech over reduced-volume music.

## Project Map

- `user/` personal taste, routines, playlists, and mood rules.
- `prompts/` system prompts and prompt templates.
- `server/` local backend modules.
- `web/src/` player UI and chat surface.
- `public/` committed audio, image, font, and local extension-download assets.
- `bridge-extension/` local browser extension for QQ Music login-state sync.
- `data/` local persistent state, generated at runtime.
- `cache/` generated or downloaded media cache, generated at runtime.
- `docs/PROJECT_STRUCTURE.md` source/runtime directory guide.

## Local Development

Start the full local stack with:

```bash
npm run dev:all
```

This checks the expected ports and starts any missing services:

- Frontend: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8788`

If you only want to check whether the local stack is up:

```bash
npm run dev:check
```

Individual services can still be started separately:

```bash
npm run dev
npm run dev:api
```

To run the development desktop client:

```bash
npm run dev:desktop
```

This starts the local services when needed, then opens Redio in Electron. In the
desktop client, the `QQ 音源` panel can open QQ Music's official login window and
save the resulting local Cookie session into the existing QQ provider.

Run a production build check before handing off code changes:

```bash
npm run build
```

## Music Provider

The default music provider is `qq`. Redio searches QQ Music by song title and
artist, then requests the QQ Music vkey endpoint for a playback URL. Full
playback usually needs one of `qm_keyst`, `qqmusic_key`, `music_key`, or
`wxskey` from a local QQ Music login session.

Set this value in `.env`:

```env
AI_RADIO_MUSIC_PROVIDER=qq
```

Open Redio's sign-in flow and use either the desktop QQ Music window or the
local Redio Bridge extension to complete the official web login. The app stores
the required Cookie fields only in local `data/qq-cookie.txt`. If QQ Music does
not return a playable URL, the result remains explicitly `failed`; Redio may
try another playable taste-sample track, but it does not present local test
audio as the requested song.

## DJ Narration

- DeepSeek generates one `intro` for every recommended song.
- Each generated intro targets 60-100 Chinese characters and is capped at 100.
- The song starts with its DJ intro; while the DJ speaks, music ramps to 50% of
  the selected volume and returns afterward.
- Qwen TTS converts the text to speech. macOS `say` remains the local fallback.

The old NetEase adapter is retained in code only. It is no longer part of the
default product path. For isolated legacy testing, explicitly set:

```env
AI_RADIO_ENABLE_NETEASE_PROVIDER=1
AI_RADIO_ENABLE_NETEASE_SERVICE=1
AI_RADIO_MUSIC_PROVIDER=netease
```

## Baseline Rules

Source files to keep under version control:

- `server/`
- `web/src/`
- `prompts/`
- `user/`
- `public/`
- `bridge-extension/`
- `scripts/`
- project config and docs

Local runtime files are ignored and can be regenerated:

- `node_modules/`
- `dist/`
- `cache/`
- `data/history.json`
- `data/queue.json`
- `data/feedback.json`
- `data/qq-cookie.txt`
- `.env` and other private env files
