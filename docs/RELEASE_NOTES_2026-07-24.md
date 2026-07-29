# Redio UI polish release notes

Date: 2026-07-24

Commit: `130885f`

## Chat

- Kept Ask Anything as the single entry to the landing-page chat panel.
- Refined the chat panel dimensions, scrolling area, message spacing, and input
  placement for desktop and narrow viewports.
- Hid message metadata by default and exposed the message date and time on
  hover or keyboard focus.
- Added the thinking shimmer and typewriter reveal for assistant text.

## DJ and player

- Updated the DJ speech bubble to the current Figma-aligned layout.
- Added the Motion-based waveform animation while DJ speech is active, with a
  reduced-motion fallback.
- Refined the circular cover queue and player spacing.
- Removed the committed static starfield SVG; the active landing background is
  rendered by the existing animated `StarfieldCanvas`.

## Settings

- Unified section spacing, panel radii, and log-item layout.
- Kept playback memory, QQ authorization, and runtime logs on the dedicated
  settings tab.

## Closeout verification

Verified on 2026-07-29:

- Fixed playable-track replacement so the top-level DJ copy follows the
  final QQ-playable first track instead of describing a failed model pick.
- Restored the landing-page Redio logo as a Home action. Ask Anything remains
  the only landing-page button that opens the chat panel.
- `npm run build` passed. Vite still reports the known warning that the main
  JavaScript chunk is larger than 500 kB.
- `npm run dev:check` passed for the frontend and API.
- Core GET endpoints and request validation returned the expected status and
  response shapes.
- A live ordinary-chat turn and a live recommendation turn both completed.
- The verified QQ track returned a full playback URL and the audio proxy
  returned `206 audio/mpeg` for a Range request.
- Desktop and 390 x 844 browser checks passed without horizontal overflow,
  clipped log cards, or console errors.
