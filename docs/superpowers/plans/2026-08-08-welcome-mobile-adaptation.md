# LIVE IN HDU Welcome Mobile Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the approved welcome-page visuals on the authenticated public trial, make its vertical composition responsive across phone sizes, and replace the shared client Logo with the user-provided PNG.

**Architecture:** Keep the current Vue view, WebGL effect, routes, and stable Logo URL. Add a closed declarative file map to the Fastify trial gateway, group the welcome heading and countdown into one responsive stage, and replace the existing binary Logo at its current path.

**Tech Stack:** Vue 3, scoped CSS, Fastify, TypeScript, Vitest, Node test runner, PowerShell public-trial verifier.

## Global Constraints

- Use the confirmed second screenshot as the visual baseline.
- Preserve the current background, lightfall, rings, colors, countdown logic, and school-start timestamp.
- Do not expose wildcard brand or font directories, admin routes, health routes, or local paths.
- Continue requiring the authenticated public-trial session for client files.
- Keep runtime data under `D:\Star\LIVE_IN_HDU_RUNTIME`.
- Reuse `/brand/randian-studio-logo.png` and replace it with `7d36a1c3cef23acef0cda0cba338a974.png` without image generation.
- Limit scope to the welcome page, shared Logo asset, public-trial file routes, verifier, and their tests.

---

### Task 1: Authenticated welcome assets

**Files:**
- Modify: `apps/freshman-mvp/test/public-trial-gateway.test.ts`
- Modify: `apps/freshman-mvp/src/public-trial/app.ts`
- Modify: `apps/freshman-mvp/test/public-trial-scripts.test.ts`
- Modify: `scripts/test-public-trial.ps1`

**Interfaces:**
- Consumes: `createPublicTrialApp`, `requireBrowserSession`, `sendFile`, `contentTypeFor`.
- Produces: authenticated GET/HEAD routes for the exact background, font, Logo, and favicon paths.

- [ ] **Step 1: Add failing gateway tests**

Extend the fixture with `brand/campus-dawn-welcome.webp` and `fonts/hdu-arrival-display.woff2`, then assert both GET and HEAD responses:

```ts
for (const expected of [
  { url: '/brand/campus-dawn-welcome.webp', type: 'image/webp' },
  { url: '/fonts/hdu-arrival-display.woff2', type: 'font/woff2' },
]) {
  const response = await app.inject({ method: 'GET', url: expected.url, headers: { cookie } });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers['content-type']), new RegExp(`^${expected.type}`));
  assert.ok(response.rawPayload.length > 0);
}
```

Keep unknown `/brand/other.png`, `/fonts/other.woff2`, traversal, and management paths at 404.

- [ ] **Step 2: Run the gateway test and verify RED**

Run:

```powershell
node --import tsx --test test/public-trial-gateway.test.ts
```

Expected: the new background and font assertions fail with status 404.

- [ ] **Step 3: Add the closed public-file map**

In `src/public-trial/app.ts`, replace one-off public-file routes with an exact mapping:

```ts
const PUBLIC_FILE_ROUTES = {
  '/favicon.svg': ['favicon.svg'],
  '/brand/randian-studio-logo.png': ['brand', 'randian-studio-logo.png'],
  '/brand/campus-dawn-welcome.webp': ['brand', 'campus-dawn-welcome.webp'],
  '/fonts/hdu-arrival-display.woff2': ['fonts', 'hdu-arrival-display.woff2'],
} as const;
```

Register only these paths, require the existing session, resolve the fixed segments under `publicDir`, return 404 on `ENOENT`, and retain the restricted `/assets/*` handler.

- [ ] **Step 4: Extend the real trial verifier**

In `scripts/test-public-trial.ps1`, request the background and font with the authenticated cookie, require status 200 and exact media types `image/webp` and `font/woff2`, and include their statuses in the JSON report. Update `public-trial-scripts.test.ts` so its stub serves and records both exact paths.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --import tsx --test test/public-trial-gateway.test.ts test/public-trial-scripts.test.ts
```

Expected: both test files pass and unknown routes remain blocked.

- [ ] **Step 6: Commit the public-file boundary**

```powershell
git add apps/freshman-mvp/src/public-trial/app.ts apps/freshman-mvp/test/public-trial-gateway.test.ts apps/freshman-mvp/test/public-trial-scripts.test.ts scripts/test-public-trial.ps1
git commit -m "fix: serve authenticated welcome assets"
```

### Task 2: Three-region responsive welcome layout

**Files:**
- Modify: `apps/freshman-mvp/test/web/welcome-view.test.ts`
- Modify: `apps/freshman-mvp/web/views/WelcomeView.vue`

**Interfaces:**
- Consumes: existing countdown computed values and `ArrivalLightfall`.
- Produces: `.welcome-brand`, `.welcome-stage`, and `.welcome-footer` as the three layout regions.

- [ ] **Step 1: Add the failing structure regression**

Add a test asserting one `.welcome-stage` contains both `.welcome-copy` and `[role="timer"]`, while `.welcome-footer` remains its sibling:

```ts
const stage = wrapper.get('.welcome-stage');
expect(stage.find('.welcome-copy').exists()).toBe(true);
expect(stage.find('[role="timer"]').exists()).toBe(true);
expect(wrapper.get('.welcome-footer').element.parentElement).toBe(wrapper.get('main').element);
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
npm run test:web -- --run test/web/welcome-view.test.ts
```

Expected: `.welcome-stage` is missing.

- [ ] **Step 3: Group the main visual content**

Wrap the existing title and countdown sections without changing their text or countdown bindings:

```vue
<section class="welcome-stage">
  <section class="welcome-copy">...</section>
  <section class="countdown-grid" role="timer" :aria-label="timerLabel">...</section>
</section>
```

- [ ] **Step 4: Replace stretch-based spacing with responsive stage rules**

Use three root rows and a bounded stage:

```css
.welcome-page {
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 100svh;
  min-height: 100dvh;
}

.welcome-stage {
  z-index: 4;
  display: grid;
  align-self: center;
  gap: clamp(16px, 3dvh, 30px);
  width: 100%;
  padding-block: clamp(20px, 5dvh, 58px);
}

.welcome-copy { margin: 0; }
.welcome-footer { padding-top: clamp(12px, 3dvh, 30px); }
```

Retain the existing ≤350px and ≤760px adjustments, but apply short-screen spacing to `.welcome-stage` rather than restoring the large footer spacer.

- [ ] **Step 5: Run the welcome tests and verify GREEN**

Run:

```powershell
npm run test:web -- --run test/web/welcome-view.test.ts test/web/countdown.test.ts test/web/arrival-lightfall.test.ts
```

Expected: welcome, countdown, and lightfall tests pass.

- [ ] **Step 6: Commit the responsive layout**

```powershell
git add apps/freshman-mvp/web/views/WelcomeView.vue apps/freshman-mvp/test/web/welcome-view.test.ts
git commit -m "fix: adapt welcome layout to phone viewports"
```

### Task 3: Shared Logo replacement and end-to-end verification

**Files:**
- Replace: `apps/freshman-mvp/web/public/brand/randian-studio-logo.png`
- Verify: `apps/freshman-mvp/dist/public-trial-client/**`

**Interfaces:**
- Consumes: user file `C:\Users\Star\Documents\xwechat_files\wxid_kwb2569bk99422_5367\temp\RWTemp\2026-08\8df39d1a523f12cba3bb49a0a01075be\7d36a1c3cef23acef0cda0cba338a974.png`.
- Produces: the existing stable Logo URL with new binary content across all client views.

- [ ] **Step 1: Replace the binary at the stable path**

Use `Copy-Item -LiteralPath <user-file> -Destination apps/freshman-mvp/web/public/brand/randian-studio-logo.png -Force`, then verify the source and destination SHA-256 hashes are identical.

- [ ] **Step 2: Run the full automated suite**

Run from `apps/freshman-mvp`:

```powershell
npm run test:all
npm run build:server
npm run build:trial
```

Expected: all non-environmental tests pass, both builds exit 0, and the trial build contains the new Logo, background, and font.

- [ ] **Step 3: Recycle only the trial gateway**

Stop the owned gateway process recorded in `D:\Star\LIVE_IN_HDU_RUNTIME\public-trial\gateway.pid.json`, retain the running cpolar process, and run:

```powershell
.\scripts\start-public-trial.ps1
```

This loads the new server bundle on port 3211 without changing the private backend or tunnel configuration.

- [ ] **Step 4: Verify local and saved public trial**

Run:

```powershell
.\scripts\test-public-trial.ps1
.\scripts\test-public-trial.ps1 -UseSavedPublicUrl
```

Expected: authenticated root, guide, chat, Logo, background, font, questions, and ask all return 200; admin and health routes remain 404.

- [ ] **Step 5: Capture responsive browser evidence**

Use Edge CDP device metrics at 320×568, 360×800, 390×844, and 430×932. For every viewport assert `document.documentElement.scrollWidth <= innerWidth`, the background image is loaded, the custom font is active, all four countdown cards are visible, and the entry button stays within the viewport safe area.

- [ ] **Step 6: Commit the Logo and final verification state**

```powershell
git add apps/freshman-mvp/web/public/brand/randian-studio-logo.png
git commit -m "feat: replace randian studio logo"
```

## Execution Choice

The user explicitly requested the token-saving implementation path. Execute inline in this session with `superpowers:executing-plans`; do not dispatch subagents.
