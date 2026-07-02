# Redio Product Plan

## Product Direction

Redio is a private AI radio DJ. The user's maintained playlist is not the playback queue and not the recommendation boundary. It is a taste sample used to infer the user's listening profile.

Recommendation should combine:

- user taste profile inferred from `user/playlists.json`
- explicit taste notes in `user/taste.md`
- routine and mood rules
- current time, weather, and runtime state
- current conversation intent
- the model's wider music knowledge

The model may recommend songs outside the 393 tagged seed tracks. Playback remains a separate provider problem.

## Architecture Target

```text
user/playlists.json
        ↓
taste profile extraction
        ↓
prompt context
        ↓
LLM recommendation
        ↓
music provider resolution
        ↓
playback / fallback
```

## Build Phases

### Phase 1: Taste Profile Foundation

- Treat `user/playlists.json` as taste samples.
- Extract mood, scene, energy, language, vocal, and representative track signals.
- Update prompts so recommendations are based on taste profile and global music knowledge, not limited to the seed list.
- Keep current playback providers unchanged.

Verification:

- `npm run build`
- `GET /api/context` includes taste profile guidance.
- A music request can still return recommend tags.

### Phase 2: Recommendation Quality

- Add stronger prompt rules for novelty, avoid-repeat behavior, and context matching.
- Keep “one song” vs “several songs” count behavior.
- Store recommendation feedback signals in history.
- Persist lightweight local feedback in `data/feedback.json`.
- Use likes, skips, and replays in prompt context.

Verification:

- Ordinary chat does not trigger playback.
- Music requests return the requested count.
- Recommended tracks are not restricted to the seed playlist.
- Feedback API can write and read local preference signals.

### Phase 3: Playback Provider Strategy

- Keep NetEase as MVP/local fallback only.
- Add provider metadata to distinguish direct audio, external player, and fallback playback.
- Evaluate optional personal-use sources separately from product recommendation logic.

Verification:

- Local fallback still works.
- NetEase failures do not break the conversation or queue.

### Phase 4: Personalization Loop

- Add lightweight feedback such as liked, skipped, replayed, and dismissed.
- Use feedback to update the taste profile or prompt context.
- Keep source data and generated runtime memory separate.

Verification:

- Feedback persists locally.
- Prompt context reflects recent preferences without exposing noisy raw history.
