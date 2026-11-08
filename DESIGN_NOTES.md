# OpenClient Design Notes

Source references analyzed in `DesignIdeen/`:

- `liner-main` - React + Tailwind desktop music player with an Apple-leaning glass interface.
- `riff-main` - Electron music player with a Material 3 inspired dark interface.

The goal is one original design language. Nothing is copied wholesale; the two
systems are reduced to their strongest ideas and unified into a single token set.

## What is taken from Liner

- The principle "glass, not boxes": surfaces are translucent tints with blur and a
  hairline border, never opaque gray slabs. Glass is used on the outer container only.
- Quiet fill scale for elements inside a surface: 4% / 7% / 10% / 14% white in dark mode.
- Type scale and calm typography: 12 caption, 13 body, 14 label, 15/16 title,
  18/20 heading, Inter as the UI face.
- Radius scale in three meaningful steps: control (small), item (cards, rows),
  panel (dialogs, top-level containers), plus full pills.
- Motion curve `cubic-bezier(0.22, 1, 0.36, 1)`, a 200 ms page rise-and-fade,
  soft spring feel for elements that land, and a slow skeleton shimmer.
- Floating shell composition: separate sidebar rail, header island and content
  surface with small gaps, window shape reacting to maximized state.
- Button interaction language: 150 ms color transitions, `scale(0.96)` on press,
  disabled at 50% opacity, visible focus ring.

## What is taken from Riff

- The full indigo/violet accent direction and Material 3 tonal container hierarchy.
- Pill navigation and pill buttons: 999 px radius, filled active pill, circular
  icon buttons, segmented edition switch built as a pill track.
- 40-44 px titlebar with centered brand mark and native-style window controls.
- The dark neutral scale: near-black background, layered container tones, low-chroma
  outlines, on-surface text with a slightly cool cast.
- M3 switch geometry and the cheeky, physical press feedback.
- The droplet toast entry from the top combined with Liner's restrained toast content.
- Settings layout with a pill navigation column and dense, well-grouped setting rows.
- Emphasized easing `cubic-bezier(0.2, 0, 0, 1)` for larger surface transitions.

## The merged system

**Mood.** "Quiet control room": near-black glass, an electric indigo accent, a
secondary mint-cyan glow used sparingly for live/online data, and one warm red
reserved for destructive actions. No decorative gradients on text; glow is
atmospheric, not neon.

**Color.**

- Canvas `#07070a`, raised canvas `#0b0b11`.
- Glass `rgba(19, 19, 28, 0.66)` with 24 px blur, 150% saturation.
- Solid containers `#12121a`, `#191924`, `#22222f`.
- Accent `#7c6cff`, accent strong `#6a58ff`, on accent `#0b0718`.
- Live/secondary `#4fd1c5`; warning `#f2b96b`; danger `#ff5c6c` (Liner's red, cooled).
- Text `#f4f4f7` / 68% / 42%; hairlines white 8% and 14%.

**Type.** Inter Variable for UI, monospace for console and version strings.
Scale: 12 / 13 / 14 / 16 / 20 / 28 / 40 with 600-700 weight for display and
500 for labels. Letter spacing stays at 0, except small uppercase eyebrows at 0.08em.

**Shape.** 8 px controls, 14 px items, 22 px panels, full pills for actions and
navigation. The app window itself uses a 14 px radius and becomes square when
maximized. Focus rings are a 2 px accent ring with an offset.

**Layout.** 44 px custom titlebar (drag region, brand center, window controls
right), 240 px sidebar with text labels that collapses to 76 px below 1180 px,
content area with 18 px gutters and a floating bottom activity bar for downloads
and launch progress. Home uses a two-column composition: a hero launch card and
a side stack with account, status and stats.

**Motion.** 160 ms hover, 220 ms page enter with a 6 px rise, 260 ms dialogs,
spring-ish landing for cards and edition switch, 2.4 s skeleton loop. Continuous
animation pauses under `prefers-reduced-motion` and while the window is hidden.

**Signature elements.** Glass panel with a 1 px inner highlight; indigo glow that
follows the selected navigation item; edition switch with a physical sliding pill;
performance preset cards that show their exact effect; console with a subtle
scanline-free dark well and colored levels; status dots with a soft pulse only
when data is live.

## OpenClient-specific rules

- UI text is English, no emojis.
- Every state has four visuals: default, hover, active/pressed, disabled.
- All numbers that can update live use tabular figures.
- Skeletons are used only for network content, never for local lists.
- Destructive actions always show an inline confirmation, never a browser dialog.
- Bedrock limits are explained in the Bedrock section once, plainly, without
  pretending that unsupported functionality exists.

## Final direction after the second pass

The user asked for the interface to lean further toward Liner. The merged system now uses:

- Liner's near-black canvas, floating glass islands and 18 px window radius.
- Inter with 30 px page titles and tighter negative tracking on display text.
- White prominent pills for primary actions and the Play button, exactly like Liner's
  glass-prominent control.
- A single violet accent (#8b6cff) matching the referenced Liner home screenshot for active
  navigation, links, toggles, focus and progress. Teal is reserved for live/online status.
- Sidebar navigation is a 64 px icon rail with a quiet white fill and a violet indicator,
  matching Liner exactly. There are no text labels or edition panels in the rail.
- The login gate introduces the product before the workspace: large editorial headline,
  feature list, and one glass sign-in card with the Microsoft device-code flow.
- The client HUD screen continues the same language: a floating game scene, drag-to-place
  HUD elements, and compact setting rows on glass.

The website follows the same rules: fixed glass navigation island, red accent, white primary
button, large editorial type, and restrained reveal motion.
