# Server

Local backend modules.

- `router.ts` local HTTP API routes.
- `auth.ts` signed Redio sessions and per-account credential encryption.
- `chat.ts` per-account normal and recommendation chat history.
- `context.ts` prompt context assembly.
- `brain.ts` LLM adapter and JSON validation.
- `music.ts` music search and playback URL resolution.
- `qq-music.ts` QQ login status, search, lyrics, and vkey playback resolution.
- `qq-login.ts` owner-bound QQ QR login state machine and asynchronous authorization flow.
- `tts.ts` speech generation and cache lookup.
- `scheduler.ts` planned segments and routine hooks.
- `state.ts` local state persistence.
