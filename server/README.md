# Server

Local backend modules.

- `router.ts` local HTTP API routes.
- `auth.ts` signed Redio sessions and per-account credential encryption.
- `chat.ts` per-account normal and recommendation chat history.
- `context.ts` prompt context assembly.
- `brain.ts` LLM adapter and JSON validation.
- `music.ts` music search and playback URL resolution.
- `qq-music.ts` QQ login status, search, lyrics, and vkey playback resolution.
- `qq-login.ts` retained server-side QQ QR compatibility flow; the web UI uses Redio Bridge.
- `tts.ts` speech generation and cache lookup.
- `scheduler.ts` planned segments and routine hooks.
- `state.ts` local state persistence.
