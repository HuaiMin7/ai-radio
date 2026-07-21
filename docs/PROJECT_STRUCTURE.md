# Project Structure

This project is a local-first AI radio prototype. Keep source files, user profile inputs, and generated runtime files clearly separated.

## Source

- `server/` local API server, model adapter, music adapter, TTS, history, and runtime state.
- `web/src/` React player UI, chat panel, playback controls, and styles.
- `prompts/` DJ persona and prompt templates.
- `public/` committed audio, image, font, and local extension-download assets.
- `bridge-extension/` source for the local QQ Music login-state bridge.
- `scripts/` local development helpers, including full-stack startup and health checks.

## User Inputs

- `user/taste.md` listening preferences.
- `user/routines.md` daily routines and listening situations.
- `user/mood-rules.md` mood and context rules.
- `user/playlists.json` structured seed playlists and track metadata.

## Local Runtime Files

These are generated locally and should not be treated as source:

- `data/history.json` playback and recommendation history.
- `data/queue.json` persisted playback queue.
- `data/feedback.json` likes, skips, and replay feedback.
- `data/qq-cookie.txt` private local QQ Music session fields.
- `cache/tts/` generated DJ speech audio.
- `cache/music/` future downloaded or cached music assets.
- `dist/` Vite production build output.

## Root Files

- `README.md` project overview and run instructions.
- `AGENTS.md` development rules for AI coding assistants.
- `package.json` scripts and dependencies.
- `vite.config.ts` frontend dev server and API proxy.
- `tsconfig*.json` TypeScript build configuration.
