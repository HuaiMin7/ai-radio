# Redio 2.0 UI Plan

## 1. Objective

Redio 2.0 should make the existing AI radio experience clearer and easier to
operate without weakening the product's core playback path.

The UI is successful when a user can:

1. understand what Redio is doing now;
2. ask for music or talk to the DJ without ambiguity;
3. see whether a recommended track is fully playable, unverified, using a
   fallback, or failed;
4. control playback without losing the conversation or queue context.

## 2. Product Invariants

These behaviors must survive the redesign:

- Recommendation and playback are separate states. A recommendation is not
  presented as playable until its source has been resolved.
- Playback status remains explicit: `full`, `unverified`, `fallback`, or
  `failed`.
- Local fallback audio must not look like the recommended song.
- Existing chat, queue, playback, volume, history, TTS, and source-status
  actions remain functional unless a later brief explicitly removes one.
- The frontend continues to use the existing backend API contracts.
- Secrets and provider credentials remain local and must not appear in the UI,
  source, screenshots, or commits.

## 3. Scope

### In scope

- Information hierarchy of the main player screen.
- Main playback area and current-track state.
- Chat and AI DJ interaction surface.
- Queue and recommendation presentation.
- Playback-source and failure status presentation.
- Playback memory entry and panel.
- Responsive behavior for desktop and narrow viewport widths.
- Visual consistency: typography, spacing, color, borders, elevation, and
  interaction states.

### Out of scope

- New music providers or provider-selection logic.
- Changes to recommendation prompts or model behavior.
- Authentication, cloud sync, deployment, or multi-user support.
- A new persistence layer.
- Backend API redesign unless a required UI state cannot be represented by the
  current contract.

## 4. Required Design Inputs

Implementation starts only after this brief is confirmed:

- Target screens or components to change.
- A visual source: screenshot, Figma frame, reference product, or an approved
  Redio 2.0 visual direction.
- Interaction target: fully functional implementation or static exploration.
- Required desktop and narrow-width viewport targets.

If there is no visual source, produce and select a visual direction before
editing the production UI.

## 5. Delivery Phases

### Phase 0: Baseline

- Capture the current main screen and important open states.
- Record desktop and narrow-width behavior.
- Verify current build and relevant interactions before visual changes.

Exit criteria:

- The current state is reproducible.
- Existing failures are separated from redesign regressions.

### Phase 1: Structure

- Confirm the page hierarchy and component ownership.
- Adjust layout and responsive behavior with the smallest necessary code
  changes.
- Preserve existing state and API behavior.

Exit criteria:

- All existing controls remain reachable.
- No content overlap, clipping, or unintended horizontal scrolling.

### Phase 2: Visual System

- Apply the approved typography, color, spacing, border, radius, elevation,
  and icon direction.
- Cover hover, focus, active, disabled, loading, empty, and error states that
  already exist in the product.

Exit criteria:

- The implementation matches the approved visual target at agreed viewports.
- Focus and status indicators remain visible.

### Phase 3: Interaction Verification

- Verify chat input and submission.
- Verify generation and returned plan rendering.
- Verify play, pause, previous, next, seek, and volume.
- Verify queue, source status, TTS, and playback memory.
- Verify at least one playable source and explicit fallback or failure
  presentation.

Exit criteria:

- `npm run build` succeeds.
- Relevant API requests return the expected JSON structures.
- Core interactions work in the rendered app.
- Known external-service limitations are reported rather than hidden.

## 6. Acceptance Checklist

- [ ] Approved design brief and visual target exist.
- [ ] Current UI baseline has been captured.
- [ ] Desktop layout has been checked.
- [ ] Narrow-width layout has been checked.
- [ ] Loading, empty, error, fallback, and failed states are distinguishable.
- [ ] Keyboard focus is visible for interactive controls.
- [ ] Chat can be entered and submitted.
- [ ] Playback controls work.
- [ ] Queue and playback memory remain usable.
- [ ] Track source status is accurate and visible.
- [ ] `npm run build` passes.
- [ ] Relevant backend APIs have been requested successfully.
- [ ] A final change and verification report is recorded.

## 7. Git Workflow

- Development branches follow `docs/AGENT_COLLABORATION.md`; UI work uses the
  `Seal/<frontend-interaction>` lane.
- Keep baseline fixes, structural changes, visual changes, and verification
  fixes in separate commits when practical.
- Do not change the package version during exploration.
- Set the release version only after scope, implementation, and acceptance are
  complete.
