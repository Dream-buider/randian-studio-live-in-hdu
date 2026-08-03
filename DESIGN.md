---
name: LIVE IN HDU
description: A mobile-first student experience that makes the quiet trip toward campus visible, then turns arrival into trusted next steps.
colors:
  hdu-blue: "#133f75"
  hdu-blue-strong: "#0c2d57"
  hdu-cyan: "#0f8da5"
  arrival-midnight: "#04152f"
  arrival-card: "rgb(249 251 255 / 96%)"
  arrival-coral: "#c9442e"
  arrival-coral-active: "#b83b28"
  arrival-white: "#ffffff"
  ink: "#172333"
  muted: "#607083"
  line: "#dce3e9"
  surface: "#ffffff"
  background: "#f3f5f7"
  focus: "#0797b2"
  danger: "#9c382f"
typography:
  arrival-numeral:
    fontFamily: '"HDU Arrival Display", "Arial Narrow", sans-serif'
    fontSize: "clamp(2.35rem, 11.5vw, 3.35rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  arrival-heading:
    fontFamily: '"HDU Arrival Display", "PingFang SC", sans-serif'
    fontSize: "clamp(2rem, 9.5vw, 2.8rem)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  body:
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif'
    fontSize: "0.82rem"
    fontWeight: 750
  arrival-brand:
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 820
    letterSpacing: "0.08em"
rounded:
  field: "10px"
  control: "12px"
  action: "14px"
  clock-card: "16px"
  floating-action: "16px"
  panel: "18px"
  card: "22px"
  sheet: "24px 24px 0 0"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "18px"
  xl: "22px"
  xxl: "24px"
components:
  arrival-cta:
    backgroundColor: "{colors.arrival-coral}"
    textColor: "{colors.arrival-white}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "15px 18px"
    height: "58px"
    width: "100%"
  countdown-card:
    backgroundColor: "{colors.arrival-card}"
    textColor: "{colors.arrival-coral}"
    typography: "{typography.arrival-numeral}"
    rounded: "{rounded.clock-card}"
    padding: "10px 2px 9px"
  student-primary-action:
    backgroundColor: "{colors.hdu-blue}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.action}"
    padding: "11px 16px"
    height: "44px"
  question-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px 22px"
---

# Design System: LIVE IN HDU

## Overview

**Creative North Star: "Campus Dawn in Motion"**

LIVE IN HDU makes the quiet trip toward campus visible. The welcome is a cinematic mobile arrival poster built from a midnight HDU-blue sky, a project-bound illustrated campus dawn, restrained cool lightfall, porcelain clock cards, and accessible coral time. It refuses both a generic metric dashboard and a copied effects demo: the scene belongs to this product, while the live Vue countdown remains the primary information.

After the threshold, the student journey becomes a calm light reading system. Question, guide, chat, and sheet surfaces use HDU blue, white cards, clear Chinese system type, explicit sources, and one strong action at a time. Expressive atmosphere is concentrated at entry; evidence and legibility govern everything that follows.

**Key Characteristics:**

- A centered, safe-area-aware phone canvas with a real Randian Studio lockup.
- A campus-dawn scene with generous night sky and restrained, disposable WebGL lightfall.
- One horizontal four-card countdown, with coral numerals and compact Chinese units.
- One solid coral, white-label action centered at the bottom of the first viewport.
- Trust shown through source links, update times, preview labels, and honest status colors.

**The Student/Admin Boundary Rule.** The arrival scene governs the welcome only. Student reading routes inherit the brand, mobile behavior, accessibility baseline, and trust language—not the cinematic background. Admin keeps its existing light, dense, 1440px operational workspace and intentionally does not inherit the arrival font, coral CTA, clock cards, campus art, lightfall, or phone-canvas constraint.

## Colors

HDU blue remains the durable identity and trust color. The arrival surface adds a darker sky, near-white clock cards, and one verified coral that works both as large numeral color and as the solid primary-action field.

### Primary

- **HDU Blue:** Student links, progress, brand text, and ordinary primary actions on light surfaces.
- **HDU Blue Strong:** Student headings and stronger text hierarchy.
- **Arrival Midnight:** The welcome fallback field beneath the campus scene; not a general dark mode.

### Secondary

- **HDU Cyan:** Evidence types, category labels, contextual accents, and visible focus support on light surfaces.

### Tertiary

- **Arrival Coral:** Countdown numerals and the welcome CTA. It is the accessible warm counterpoint to the midnight/campus field.
- **Arrival Coral Active:** The pressed state of the welcome CTA only.

### Neutral

- **Arrival Card:** The near-opaque clock-card surface that protects number legibility over the scene.
- **Arrival White:** Welcome headline, brand label, separators, CTA copy, and high-contrast supporting text.
- **Ink:** Long-form answer and guide copy.
- **Muted:** Metadata, secondary explanations, source hosts, and update time.
- **Line:** Dividers and quiet borders on light student and admin surfaces.
- **Surface / Background:** White reading containers over the cool light page field.
- **Focus:** Shared three-pixel keyboard outline.
- **Danger:** Validation and failure states only.

**The One Coral Arrival Rule.** Coral is allowed on the welcome clock and its single CTA. Downstream student buttons remain HDU blue, and admin controls remain in their established operational palette.

**The Illustrated Evidence Rule.** `campus-dawn-welcome.webp` is an atmospheric, project-bound illustration. Never label or reuse it as documentary campus photography or evidence.

## Typography

**Display Font:** HDU Arrival Display (with Arial Narrow or PingFang SC fallback)
**Body Font:** PingFang SC, Microsoft YaHei, Noto Sans CJK SC, system-ui, sans-serif
**Label Font:** The body stack, using weight and tracking rather than a separate family

**Character:** The local display subset gives the arrival moment a narrow, poster-like voice. The system stack keeps answers, controls, sources, and admin work familiar and highly legible in WeChat and mobile browsers. Changing numerals use tabular alignment.

The shipped 4,760-byte font subset lives at `apps/freshman-mvp/web/public/fonts/hdu-arrival-display.woff2`. Its SIL Open Font License 1.1 and attribution must remain at `apps/freshman-mvp/web/public/fonts/OFL-hdu-arrival-display.txt` whenever the font is bundled or redistributed.

### Hierarchy

- **Arrival Numeral:** Countdown values only; narrow, tabular, coral, and centered inside each card.
- **Arrival Heading:** The threshold statement and completed state; white, shadow-protected, and held to one line.
- **Title:** Student question and guide headings in the body stack and HDU Blue Strong.
- **Body:** Answers and guidance with generous line height.
- **Label:** Units, actions, categories, trust states, and timestamps.
- **Arrival Brand:** `LIVE IN HDU` beside the real logo, with deliberate but compact tracking.

**The Display Is an Event Rule.** HDU Arrival Display belongs to the welcome heading, countdown numerals, and separators. Answers, navigation, forms, and admin tools use the system sans stack.

## Layout

The document supports a 320px minimum. The welcome fills `100vh` with a `100dvh` override, remains centered, and caps at 430px; wider screens show the phone canvas rather than a stretched desktop landing page. The grid runs brand, flexible night/copy region, horizontal clock, then the scene-backed footer. Default safe-area padding is 22px on the top and sides and 20px at the bottom.

The four clock cards share one row. Three narrow colon tracks separate four flexible card tracks, preventing the values from becoming a metric grid. The headline sits immediately above the clock; the campus dawn opens below it; timestamp and CTA remain centered and clear of the bottom inset.

At 350px and below, side padding contracts to 17px, the logo becomes 42px, the brand label becomes 0.9rem, separator tracks contract from 8px to 5px, and card corners reduce from the clock-card radius to the action radius. At short heights of 760px and below, top/bottom padding tightens, headline and numerals scale down, clock cards reduce to 86px minimum height, the footer gap compresses, and the CTA reduces from 58px to 54px. These adaptations are what keep the verified 320px canvas intact; they are not optional polish.

Question, chat, and guide routes continue to cap at 720px, remain single-column and touch-first, and use safe-area padding. Their persistent ask action and bottom sheets remain visual-viewport aware.

**The Phone Is the Canvas Rule.** 320px is the supported floor, 350px triggers compact width behavior, and 430px is the welcome cap. Do not introduce a second desktop information architecture for student routes.

## Elevation & Depth

Arrival depth comes first from the campus image, restrained overlay gradients, and animated lightfall. Clock cards add a crisp white edge, a low blue-black shadow, and a subtle inset highlight so they remain readable without glass blur. The solid coral CTA uses the same structural logic with a stronger bottom shadow. Light reading surfaces preserve the existing ambient card shadow, while sheets use an upward directional shadow.

**The Scene Before Shadow Rule.** Shadows protect hierarchy and legibility over the scene; they do not substitute for the scene or turn the clock into floating glass panels.

## Shapes

Clock cards are upright, softly rounded rectangles. Their consistent silhouette makes four different values read as one clock. The CTA uses the same 14px compact radius on narrow screens and remains a solid bar, not a pill. The circular logo is the only foreground circle; the campus art and lightfall supply organic depth behind it.

Downstream student controls keep the existing 10–16px family, reading cards use 22px, sheets use 24px top corners, and status/source labels remain pills. Admin preserves its current form and panel radii rather than adopting clock-card geometry.

## Components

### Campus Dawn Scene

- **Asset:** `/brand/campus-dawn-welcome.webp`, preloaded from the root HTML and rendered center-bottom at cover size over the Arrival Midnight fallback.
- **Protection:** A light top/radial veil controls contrast; a dark bottom veil protects the timestamp and CTA.
- **Meaning:** Atmospheric illustration only, never a source image or claim of official campus documentation.
- **Fallback:** The midnight background, overlays, copy, clock, and CTA remain complete if the image or WebGL effect is unavailable.

### Arrival Lightfall

- **Role:** A decorative, pointer-transparent, screen-reader-hidden WebGL layer occupying the upper 64% of the welcome scene.
- **Motion:** Twelve evenly staggered meteors travel on near-parallel straight paths from left-top to right-bottom, forming a continuous rain rather than isolated beams. Each meteor fades in, reaches a bounded highlight, and fades out without flashing the whole sky.
- **Perspective:** Far, middle, and near depth values derive apparent width, trail length, brightness, and relative speed. Near streaks are fewer and larger; far streaks remain fine and quiet.
- **Color:** Blue-white light remains dominant, with only a restrained dawn-warm tint at highlights.
- **Startup:** Do not create WebGL when reduced motion is requested. Otherwise use a transparent, low-power, non-antialiased, depthless renderer with device pixel ratio capped at 1.5.
- **Lifecycle:** Resize through `ResizeObserver`; update by `requestAnimationFrame`; skip rendering while the component is paused or the document is hidden.
- **Teardown:** Cancel the frame, remove the visibility listener, disconnect observation, release program and geometry, remove the canvas, lose the GL context when possible, and call renderer destruction when available.
- **Failure:** Initialization is wrapped in cleanup-safe failure handling. If WebGL cannot start, the static campus-dawn scene remains the intended fallback—no error UI and no missing content.

### Horizontal Countdown Clock

- **Structure:** Four equal flexible card tracks for days, hours, minutes, and seconds, separated by three narrow colon tracks.
- **Card:** Near-white, bordered, shadowed, and centered; values are coral and units are dark HDU blue.
- **State:** Hours, minutes, and seconds are zero-padded; days remain natural width; all values clamp at zero after arrival.
- **Motion:** Only the seconds value steps, using a 160ms clip-and-translate animation with no blur or opacity loss.
- **Accessibility:** The clock has one useful timer label but no per-second live announcement. Only the completed heading becomes a status message.

### Welcome CTA

- **Shape:** Full-width solid coral rectangle, 58px high by default and 54px on short canvases.
- **Copy:** White, bold, centered Chinese action text with no arrow or competing secondary action.
- **State:** Pressed coral plus a one-pixel downward translation; visible global focus remains mandatory.

### Question Cards

- **Shape:** 22px white reading surface with generous internal padding.
- **Content:** Progress and category, question, answer, trust state, sources, update time, then recovery/report action.
- **Depth:** One ambient shadow; contextual cards may remain flat.

### Ask Action, Sheets, and Fields

- **Ask action:** Persistent 54px HDU-blue action above the safe-area bottom inset.
- **Sheets:** White, top-rounded, visual-viewport-aware, internally scrollable, and focus-managed.
- **Fields:** Clear label, quiet border, readable body type, and the shared focus outline.

### Trust and Source Labels

Compact pills use role-specific pale backgrounds: cyan for knowledge, green for approved trust, and amber for preview or uncertainty. Their copy must match the actual evidence state and retain sources and update dates.

## Do's and Don'ts

### Do:

- **Do** preserve the campus-dawn image as a project-bound illustrated scene with a complete midnight fallback.
- **Do** keep the four countdown cards on one horizontal row at 320, 350, and 430px widths.
- **Do** use Arrival Coral for the clock values and the solid welcome CTA, with white centered CTA copy.
- **Do** preserve whole-second accuracy, tabular numerals, zero clamping, 44px touch targets, visible focus, and quiet timer semantics.
- **Do** stop or omit lightfall rendering for reduced motion, hidden documents, explicit pause, initialization failure, and component teardown as implemented.
- **Do** retain preview, community-source, review-state, and update-time disclosures across student reading surfaces.

### Don't:

- **Don't** restore the vertical countdown wall or a porcelain welcome action.
- **Don't** turn the clock into generic dashboard metrics, glass panels, stacked rows, or a desktop grid.
- **Don't** add a CTA arrow, split alignment, gradient fill, or non-white CTA copy.
- **Don't** announce every second, blur/fade active numerals, or keep decorative WebGL running when it is not useful.
- **Don't** treat the campus art as documentary photography or imply official university publication.
- **Don't** carry the arrival font, coral CTA, campus scene, clock cards, or lightfall into admin tools.
