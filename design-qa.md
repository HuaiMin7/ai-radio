# Redio 2.0 Landing Page Design QA

- Source visual truth: `/private/tmp/redio-figma-164-1625.png`
- Implementation screenshot: `/private/tmp/redio-local-164-1625-v2.png`
- Full-view comparison: `/private/tmp/redio-comparison-164-1625-v2.png`
- Responsive screenshot: `/private/tmp/redio-local-164-1625-mobile.png`
- Source node: Figma `sYN4FG7B7fNo7Mkkp1mX6D`, node `164:1625`
- Desktop viewport: `1440 × 900`
- Responsive viewport: `390 × 844`
- State: unauthenticated landing page

## Findings

No actionable P0, P1, or P2 mismatches remain.

- Fonts and typography: Doto is used for the Redio wordmark and the official
  Inter variable font is bundled for the navigation, button, and hero heading.
  The hierarchy, weights, line height, wrapping, and copy match the source.
- Spacing and layout rhythm: the 96 px navigation, 80 px horizontal padding,
  40 px navigation gaps, centered hero, 24 px copy gap, and 800 px glow match
  the Dev Mode values.
- Colors and visual tokens: the `#0a0908` background, white foregrounds, and
  70% subtitle opacity match the source.
- Image quality and asset fidelity: the original Figma ellipse and starfield
  assets are used directly. No placeholder, CSS drawing, or recreated image is
  present.
- Copy and content: `Redio`, navigation labels, `Join the Radio`, `Music's`,
  and `你的心情，自有频率` match the source.
- Interaction: the primary button and navigation controls are keyboard
  focusable. `Join the Radio` was clicked in the rendered app and opened the
  existing radio interface.
- Responsive behavior: the narrow viewport retains the hero composition,
  removes the desktop navigation links, and has no visible clipping or
  horizontal overflow.

## Focused Region Comparison

A separate crop was not required because the 1440 × 900 side-by-side
comparison keeps the navigation, wordmark, button, hero typography, glow, and
starfield readable at their native viewport size.

## Patches Made Since First QA Pass

- Added the official Inter variable font to remove fallback-font drift.
- Changed the header from grid centering to the Figma `space-between` layout.
- Kept the Figma-provided ellipse and starfield assets at their specified
  dimensions and blend order.

## Verification

- `npm run build`: passed.
- Frontend health check at `http://127.0.0.1:5173/`: HTTP 200.
- API health check at `http://127.0.0.1:8788/api/now`: HTTP 200.
- Browser console warnings/errors: none.
- Primary entry interaction: passed.

## Logged-in Landing State

- Source node: Figma `sYN4FG7B7fNo7Mkkp1mX6D`, node `164:1145`.
- Target viewport: `1440 × 900`.
- Target state: QQ Music logged in, account avatar and nickname visible, bottom
  conversation input visible.

Implemented from Dev Mode:

- 44 px account pill with a 32 px avatar and returned nickname.
- 800 × 80 bottom conversation input with the Figma send icon.
- Existing Electron `openQQMusicLogin` flow connected to `Join the Radio`.
- QQ login status extended with an avatar URL derived from the authenticated
  account ID.
- Conversation submission routes into the existing chat and planning flow.

The production build passes. Screenshot comparison and live interaction QA for
the logged-in state are blocked because the in-app browser denied access to the
local URL during this pass. The actual QR login also requires the Electron
desktop client and a user-completed QQ scan.

## Focused Input Box Update

- Source node: Figma `sYN4FG7B7fNo7Mkkp1mX6D`, node `164:1161`.
- Target component: logged-in landing page bottom input.

Implemented from Dev Mode:

- Kept the search form at the Figma component size: 800 × 80, with narrow
  viewport shrinking only through `max-width: 100%`.
- Matched the Figma container values: black background, 68 px radius,
  `20px 16px 8px 20px`-equivalent horizontal/vertical padding.
- Replaced the earlier flat blue border with a 1 px masked gradient stroke:
  magenta/purple on the left, muted dark gray through the top span, and blue
  purple on the right/bottom edge, matching the visual source more closely
  than the raw Dev Mode `border-[#341fff]` text output.
- Matched the text input typography values: 20 px font size, 500 weight,
  22 px line height, `rgba(255,255,255,0.8)` placeholder at 40% opacity.
- Kept the send icon button visually active in the empty state, matching the
  Figma component; empty submit still no-ops through the existing submit guard.

Verification:

- `npm run build`: passed.
- `git diff --check`: passed.
- Live screenshot/interaction QA remains blocked by the in-app browser local
  URL policy for `http://127.0.0.1:5173/`.

## Landing Input Submit To Chat Popup

- Source node: Figma `sYN4FG7B7fNo7Mkkp1mX6D`, node `164:3135`.
- Target state: logged-in landing page with text entered in the bottom input.

Implemented behavior:

- The logged-in landing input now submits through the existing `generateSegment`
  flow without switching immediately into the main radio page.
- Submitting the landing input opens the existing `ChatWindow` over the Redio
  2.0 landing page, so the user sees the conversation popup after sending.
- The same `ChatWindow` instance is reused by the main radio view to avoid a
  second divergent chat implementation.
- Opening the DJ/agent profile from the popup still enters the main app shell
  intentionally.

Verification:

- `npm run build`: passed.
- `git diff --check`: passed.
- Live browser interaction QA remains blocked by the in-app browser local URL
  policy for `http://127.0.0.1:5173/`; this state needs manual refresh and
  login verification in the running local client.

## Redio Recommendation Reply And Track Cards

- Source node: Figma `sYN4FG7B7fNo7Mkkp1mX6D`, node `164:4189`.
- Target state: logged-in Redio 2.0 landing page with the Agent chat popup
  open after a recommendation request.

Implemented behavior:

- Redio recommendation replies now render the recommendation reason from
  `plan.reason` in the assistant bubble, with a typewriter-style text reveal.
- Recommended songs render from the existing `plan.play` data.
- Track cards show at most three songs by default.
- The `全部歌曲` control expands/collapses the full recommendation list for
  that specific assistant message.
- Track cards now render existing `coverUrl` artwork when the backend resolves
  one; missing artwork falls back to a local visual placeholder.
- The Redio 2.0 landing popup uses the Figma-style 800 × 661 Agent panel and
  keeps the bottom landing input outside the popup instead of showing the old
  1.0 composer inside the panel.

Verification:

- `npm run build`: passed.
- `git diff --check`: passed.
- Frontend dev server `127.0.0.1:5173`: not listening during this pass.
- API health request to `127.0.0.1:8788/api/now`: not verified; the local
  request failed even though a process was listening on the port.
- Live visual and interaction QA remains blocked until the local frontend/API
  services are running and browser access to the local URL is available.

## Landing Logo Opens Chat Popup

- Source: browser annotation on the Redio logo in the logged-in landing header.

Implemented behavior:

- Clicking the Redio wordmark on the UI2.0 logged-in landing page now opens the
  Redio chat popup.
- This action does not enter or expose the old 1.0 radio interface.
- Other UI2.0 navigation items remain blocked from opening the old 1.0 shell
  until matching UI2.0 pages exist.

Verification:

- `npm run build`: passed.
- `git diff --check`: passed.

## Chat Panel Open / Close Correction

- Source visual truth:
  `/var/folders/pn/h6vkvtw56x72xw0ks5wszdnr0000gp/T/codex-clipboard-db010582-d4ea-4284-ad00-a336001c722d.png`.
- Target states: logged-in UI2.0 landing page with the chat closed and open.
- Target viewport: desktop composition shown in the supplied side-by-side image.
- Implementation screenshot: unavailable in this pass because browser access
  to `http://127.0.0.1:5173/` was rejected by the active browser security policy.

Implemented behavior:

- Clicking the Redio wordmark opens the complete chat popup.
- Sending from the bottom conversation input opens the complete chat popup
  before the planning request begins.
- Clicking the popup's right-side Figma arrow closes the popup entirely.
- Closing the popup does not clear conversation messages or the generated plan.
- The incorrect intermediate collapsed-header state was removed.

Fidelity review:

- Fonts and typography: no typography changes were made.
- Spacing and layout rhythm: the open popup retains the established Figma panel
  dimensions; the closed state removes the panel instead of shrinking it.
- Colors and visual tokens: existing UI2.0 dark panel and landing tokens remain
  unchanged.
- Image quality and asset fidelity: the exact Figma `164:4670` arrow asset is
  still used for the close control.
- Copy and content: the close control now exposes the accessible label
  `关闭对话`.

Verification:

- `npm run build`: passed.
- `git diff --check`: passed.
- Source-code path verification: logo open, input-submit open, and arrow close
  are all connected to the same `isChatOpen` state.
- Live browser interaction, visual comparison, and console check: blocked
  because the active browser security policy rejected access to the local URL;
  no alternate browser route was used.

## Circular Queue Player

- Source nodes: Figma `140:132`, `177:650`, and `165:4787` in file
  `sYN4FG7B7fNo7Mkkp1mX6D`.
- Target state: logged-in UI2.0 player with the current cover centered, history
  covers on the left, and upcoming covers on the right.
- Implemented: 260 px current cover, three visible arc slots per side,
  ±20/40/60-degree rotation, swipe navigation, cover click navigation,
  track/artist/time display, progress seeking, transport controls, and volume.
- Motion source: the three Figma nodes returned no authored motion tracks; the
  requested swipe behavior uses a state-driven 520 ms eased transition and
  respects `prefers-reduced-motion`.
- Playback mapping: queue interaction calls the existing `playTrackAt`,
  previous/next, seek, playback, and volume handlers. No parallel UI-only queue
  state was introduced.
- `npm run build`: passed.
- `git diff --check`: passed.
- Visual/browser interaction QA: intentionally deferred to the user's later
  consolidated frontend testing pass.

final result: blocked

## Iconsax ButtonGradient Feasibility Port

- Source visual truth: live `https://ai.iconsax.io/` `ButtonGradient` control and
  `/var/folders/pn/h6vkvtw56x72xw0ks5wszdnr0000gp/T/codex-clipboard-c3a8b702-79e6-40d8-a553-621a19e32f8e.png`.
- Source DOM/CSS/script: captured from the live control and its public
  `useTokens.Dph4dLeo.css` and `BHykR3-6.js` assets.
- Implementation screenshot: unavailable because the local in-app browser has no
  QQ Music login state, while the requested button belongs to the logged-in
  player state.
- Viewport/state: desktop, UI2.0 logged-in player, button fixed at the lower-left
  of `.landingHero`.
- Full-view comparison evidence: blocked by the unavailable logged-in state.
- Focused comparison evidence: source control measured at `42px` high; the local
  port uses the source DOM layers, inline sparkle SVG, six color nodes, CSS rules,
  1500ms random position interval, and 2000ms color transition.
- Verification: `npm run build` and `git diff --check` passed.
- Blocker: no authenticated local browser state for a same-state rendered capture.

final result: blocked

## Volume Popover Visibility Correction

- Bug evidence: the volume popover was rendered permanently and obscured the
  current song title and lyric/caption region.
- Root cause: Figma node `198:734` documents the expanded component variants;
  it does not mean the expanded variant should be the player's default state.
- Fix: the toolbar volume button now opens/closes the popover. The popover is
  absent from the DOM by default, while its internal icon continues to control
  mute/unmute and restore the previous audible volume.
- `npm run build`: passed.
- Live logged-in visual verification: not available after reload because the
  local browser session returned to the logged-out landing state.

final result: blocked

## Volume Control

- Source: Figma node `198:734` in file
  `sYN4FG7B7fNo7Mkkp1mX6D`.
- Source visual truth: `/private/tmp/figma-volume-states.png`.
- Implementation screenshot:
  `/private/tmp/redio-volume-control-198-734.png`.
- Target state: logged-in UI2.0 player with the volume control visible above
  the media-controls volume button.

Implemented from Dev Mode:

- Replaced the temporary horizontal control with the Figma `49 × 193.252px`
  vertical white bubble and its pointed bottom.
- Matched the `100 × 3px` rotated track, `#fb3367` fill, `#efefef` remainder,
  12px PingFang percentage label, and 16px sound/mute icons.
- Used the original Figma vector geometry for the bubble and both volume icons.
- Kept the requested product behavior: 50% default, live range updates, 0%
  disabled muted state, and restoring the pre-mute volume after unmuting.

Verification:

- `npm run build`: passed.
- Rendered geometry: bubble `49 × 193.25px`, slider slot `3 × 100px`, label
  `30 × 20px`, icon `16 × 16px`.
- Live interaction: changing the range to 27% updated both fill and label;
  mute changed to 0%, disabled the slider, and swapped the icon; unmute
  restored 50%.
- Browser console errors: none.
- Direct source and implementation screenshots were inspected. The required
  combined side-by-side comparison artifact could not be generated because
  the active browser policy rejected the temporary comparison page URL.

final result: blocked

## DJ Speech Bubble

- Source: Figma node `193:665` in file `sYN4FG7B7fNo7Mkkp1mX6D`.
- Source visual truth: `/private/tmp/figma-dj-bubble.png` at the node's native
  `600 × 72` size.
- Target state: logged-in UI2.0 player while the DJ intro audio is actively
  playing.
- Implemented: top-left `600 × 72` frosted speech bubble, `48 × 48` Redio DJ
  avatar, two-line PingFang copy, and the exact `28 × 16` waveform artwork from
  the Figma source.
- State mapping: the bubble becomes visible only after the DJ audio `play`
  event; `pause`, `ended`, playback replacement, TTS failure, and unavailable
  track handling all clear the visible bubble and its copy.
- Visual inspection: component dimensions, padding, gap, radius, translucent
  fill, blur, text metrics, avatar, and waveform match the Figma node values.
- `npm run build`: passed.
- Live audio-state browser QA: blocked because the in-app browser rejected the
  automated audio start under its autoplay policy. The production state was
  restored after the visual preview; no forced-visible QA state remains.

final result: blocked

## Authorized Mineradio Particle Vortex

- Source visual truth: `/private/tmp/mineradio-frames/clip-08.mov.png`.
- Earlier source states: `/private/tmp/mineradio-frames/clip-00.mov.png` and
  `/private/tmp/mineradio-frames/clip-04.mov.png`.
- Implementation screenshot:
  `/private/tmp/redio-mineradio-vortex-implementation.png`.
- Source recording:
  `/Users/zengxiangmin/Desktop/录屏2026-07-13 下午12.03.31.mov`.
- Target viewport: desktop widescreen.

Comparison findings:

- The source begins as a sparse field, gathers into a curved ribbon, and ends
  as a dense vertical mist vortex on the right side of the screen.
- Redio now uses the authorized 118 × 118 particle geometry and the source
  mist-angle, radius, curl, ribbon, color, alpha, point texture, and bloom
  formulas instead of the earlier random-star approximation.
- The first local pass exposed two P2 mismatches: the vortex was horizontal
  and the bloom points were too large. The particle group was rotated into the
  vertical orientation, moved to the right-side composition, and the point
  scale was reduced before the final capture.
- The final local capture preserves the source composition: sparse left-side
  stars, a vertically oriented dense vortex on the right, cool white/blue
  particles, gradual seven-second formation, and slow continuous drift.
- The canvas remains below all Redio controls and does not intercept pointer
  input. The existing player, queue, login, and conversation behavior were not
  changed.

Verification:

- `npm run build`: passed.
- WebGL canvas: rendered at `2240 × 1260` backing resolution for the active
  `1280 × 720` viewport.
- Source-to-implementation visual comparison: passed for the requested
  background particle region.
- Remaining build note: Vite reports the existing Three.js bundle above its
  500 kB warning threshold; this does not block local testing.

final result: passed

## Media Controls to Input Spacing

- Source: Figma node `165:4787`, content frame `165:4956`.
- Target: desktop logged-in player; `Media Controls` and `search` are sibling items
  in a vertical content stack with a `40px` gap.
- Implementation: `.landingPage.isLoggedIn .landingHero` now applies `gap: 40px`
  between the circular player (whose content ends at Media Controls) and
  `.landingAsk`.
- Build: `npm run build` passed.
- CSS integrity: `git diff --check` passed.
- Live visual capture: blocked because both active local browser tabs currently
  render the logged-out state, so the Media Controls region is not present.

final result: blocked
