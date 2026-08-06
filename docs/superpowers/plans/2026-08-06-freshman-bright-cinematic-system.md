# Freshman Bright Cinematic System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restage every freshman-facing route as one bright, warm, cinematic Randian Studio experience while preserving all existing behavior, evidence, accessibility, and the separate admin design.

**Architecture:** Keep the current Vue route/component structure. Add a student-only `data-theme="randian-dawn"` boundary so the global admin palette cannot drift; keep OGL/WebGL only in `ArrivalLightfall`, and use CSS/native state transitions for questions, chat, guide, and sheets. Lock shared multi-page decisions in a small YAML model before editing UI code.

**Tech Stack:** Vue 3 SFCs, TypeScript, Vue Router, Vitest, Vue Test Utils, OGL/WebGL, CSS, Vite.

## Global Constraints

- Scope: `/`, `/questions`, `/chat`, `/guide`, `QuestionCatalog`, and `AskSheet` only.
- Do not modify admin views/components, `router.ts`, `api.ts`, Mock data, server/database code, `PRODUCT.md`, `DESIGN.md`, package manifests, lockfiles, or Vite config.
- Preserve Logo, product name, countdown logic/semantics, question/chat behavior, four guide stations, sources, trust states, timestamps, disclaimers, focus management, and visual-viewport behavior.
- Use only existing Logo and campus-dawn illustration; do not generate, fetch, download, or hotlink assets.
- Add no dependency. WebGL is welcome-only.
- Test 320/375/390/430px widths, 640/844px heights, desktop phone frame, WebGL failure, reduced motion, soft keyboard, and all UI states.
- Never commit, push, open a PR, or publish without separate explicit user approval. Commit steps below are approval gates only.

## File Map

- Create `docs/superpowers/specs/2026-08-06-freshman-bright-cinematic-design-model.yaml`: locked multi-page visual contract.
- Modify `WelcomeView.vue` and `ArrivalLightfall.vue`: bright film opening and warm exposure shader.
- Modify `QuestionDeckView.vue`: student boundary and directional card transition state.
- Modify `ChatView.vue`: student boundary and answer-stage marker.
- Modify `GuideView.vue`: student boundary and dawn energy route.
- Modify `QuestionCatalog.vue` and `AskSheet.vue`: cinematic sheet marker and grab handle, no behavior changes.
- Modify `styles/tokens.css`: student-scoped palette and all downstream visual overrides; leave admin selectors intact.
- Modify the four existing Web test files that cover welcome, lightfall, deck/chat/sheets, and guide.

---

### Task 1: Lock the Student Theme Boundary

**Files:**
- Create: `docs/superpowers/specs/2026-08-06-freshman-bright-cinematic-design-model.yaml`
- Modify: `apps/freshman-mvp/web/views/WelcomeView.vue`
- Modify: `apps/freshman-mvp/web/views/QuestionDeckView.vue`
- Modify: `apps/freshman-mvp/web/views/ChatView.vue`
- Modify: `apps/freshman-mvp/web/views/GuideView.vue`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/welcome-view.test.ts`
- Test: `apps/freshman-mvp/test/web/question-deck.test.ts`
- Test: `apps/freshman-mvp/test/web/guide-view.test.ts`

**Interfaces:** Produces `data-theme="randian-dawn"` on every student root and student-only variables under `[data-theme="randian-dawn"]`.

- [ ] **Step 1: Write failing theme-boundary tests**

Add this assertion to the direct WelcomeView, QuestionDeckView, and GuideView mounts. In the existing `/chat` integration case in `question-deck.test.ts`, select `main.chat-page` from the mounted `App` and make the same assertion for ChatView:

~~~ts
expect(wrapper.get('main').attributes('data-theme')).toBe('randian-dawn');
expect(wrapper.get('main.chat-page').attributes('data-theme')).toBe('randian-dawn');
~~~

- [ ] **Step 2: Run tests and confirm failure**

Run `npm.cmd --prefix apps/freshman-mvp run test:web`.

Expected: new `data-theme` assertions fail; existing behavior assertions stay green.

- [ ] **Step 3: Add roots, YAML model, and exact scoped tokens**

Add the theme attribute to the existing root main element on all four views.

Create the model with:

~~~yaml
meta: { name: LIVE IN HDU freshman dawn, register: h5 }
dials:
  soul: 9
  spectacle: { welcome: 8, questions: 4, chat: 3, guide: 5 }
  density: 5
color:
  background: "#FFF3E8"
  surface: "#FFF9F3"
  accent: "#D94B32"
  action: "#C43A27"
  sunlight: "#F0A23A"
  ink: "#2E1C19"
  muted: "#765B54"
  trust: "#214B73"
  focus: "#0F7F94"
type: { display: HDU Arrival Display, body: system Chinese sans }
material: warm subtitle paper and film exposure
motion: { easing: "cubic-bezier(.16, 1, .3, 1)", heavy_engine: welcome only }
~~~

Add after the admin section in `tokens.css`:

~~~css
[data-theme="randian-dawn"] {
  --student-bg: #fff3e8;
  --student-surface: #fff9f3;
  --student-accent: #d94b32;
  --student-action: #c43a27;
  --student-sun: #f0a23a;
  --student-ink: #2e1c19;
  --student-muted: #765b54;
  --student-trust: #214b73;
  --student-focus: #0f7f94;
  --student-line: rgb(110 52 38 / 13%);
  --student-shadow: 0 18px 44px -30px rgb(115 48 30 / 48%);
  color: var(--student-ink);
}
~~~

Do not change global `:root` values used by admin.

- [ ] **Step 4: Verify tests and admin isolation**

Run `npm.cmd --prefix apps/freshman-mvp run test:web` and then:

~~~powershell
git diff --name-only -- apps/freshman-mvp/web/views/AdminView.vue apps/freshman-mvp/web/components/AdminAnswerEditor.vue apps/freshman-mvp/web/components/AdminIntentList.vue apps/freshman-mvp/web/components/AdminReviewQueue.vue
~~~

Expected: Web tests pass; admin diff prints nothing.

- [ ] **Step 5: Approval-gated checkpoint**

Show `git diff --stat` and `git status --short`. Do not commit without explicit approval. If approved, commit message: `style(frontend): establish freshman dawn theme`.

---

### Task 2: Restage Welcome as a Bright Film Opening

**Files:**
- Modify: `apps/freshman-mvp/web/views/WelcomeView.vue`
- Modify: `apps/freshman-mvp/web/components/ArrivalLightfall.vue`
- Test: `apps/freshman-mvp/test/web/welcome-view.test.ts`
- Test: `apps/freshman-mvp/test/web/arrival-lightfall.test.ts`

**Interfaces:** Produces decorative cinema roles and shader uniforms `uWarmth=0.68`, `uExposure=0.22`; preserves `paused`/`reducedMotion`, teardown, DPR cap, and failure fallback.

- [ ] **Step 1: Write failing cinema structure and shader tests**

Replace radar expectations with:

~~~ts
expect(wrapper.get('[data-role="cinema-aperture"]').attributes('aria-hidden')).toBe('true');
expect(wrapper.findAll('[data-role="film-focus-ring"]')).toHaveLength(3);
expect(wrapper.get('[data-role="exposure-horizon"]').attributes('aria-hidden')).toBe('true');
~~~

Extend the shader profile test:

~~~ts
expect(ogl.programUniforms?.uWarmth?.value).toBe(0.68);
expect(ogl.programUniforms?.uExposure?.value).toBe(0.22);
~~~

- [ ] **Step 2: Run tests and confirm missing roles/uniforms fail**

Run `npm.cmd --prefix apps/freshman-mvp run test:web`.

- [ ] **Step 3: Replace technical radar markup with film-focus markup**

Inside `.welcome-scene`, retain `<ArrivalLightfall />` and add:

~~~vue
<div class="welcome-cinema-aperture" data-role="cinema-aperture" aria-hidden="true">
  <span class="film-focus-ring film-focus-ring-outer" data-role="film-focus-ring" />
  <span class="film-focus-ring film-focus-ring-middle" data-role="film-focus-ring" />
  <span class="film-focus-ring film-focus-ring-inner" data-role="film-focus-ring" />
  <span class="film-frame-line film-frame-line-top" />
  <span class="film-frame-line film-frame-line-bottom" />
</div>
<span class="welcome-exposure-horizon" data-role="exposure-horizon" aria-hidden="true" />
~~~

Keep Logo, countdown text, Beijing time, exact CTA text, and named deck route.

- [ ] **Step 4: Warm the shader without altering lifecycle code**

Add GLSL uniforms and blend:

~~~glsl
uniform float uWarmth;
uniform float uExposure;
vec3 cool = vec3(0.70, 0.84, 0.96);
vec3 ember = vec3(1.0, 0.34, 0.18);
vec3 sunlight = vec3(1.0, 0.72, 0.32);
vec3 color = mix(cool, ember, uWarmth * (0.38 + vUv.y * 0.18));
color = mix(color, sunlight, clamp(horizon * uExposure * 5.0, 0.0, 0.62));
~~~

Register `uWarmth: { value: 0.68 }` and `uExposure: { value: 0.22 }`. Leave setup/resize/visibility/teardown code unchanged.

- [ ] **Step 5: Restyle the welcome**

Use warm sunrise overlays, subtitle-paper countdown cards, partial film-focus rings, deep-coral CTA, and this entrance order: brand 80ms, title 220ms, four cards 360/430/500/570ms, footer 680ms. Animate only transform/opacity/clip-path. Reduced motion removes exposure sweeps and shows the final frame.

- [ ] **Step 6: Verify tests and builds**

Run separately:

~~~powershell
npm.cmd --prefix apps/freshman-mvp run test:web
npm.cmd run build
npm.cmd --prefix apps/freshman-mvp run build:trial
~~~

Expected: all tests pass and both builds exit 0.

- [ ] **Step 7: Approval-gated checkpoint**

Do not commit without approval. If approved, commit message: `style(frontend): restage welcome as bright film opening`.

---

### Task 3: Add Directional Question Scene Changes

**Files:**
- Modify: `apps/freshman-mvp/web/views/QuestionDeckView.vue`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/question-deck.test.ts`

**Interfaces:** Produces `Ref<'next' | 'previous' | 'direct'>` and `data-direction` on the deck surface; preserves question persistence and 50px swipe threshold.

- [ ] **Step 1: Write failing direction tests**

Extend navigation and catalog tests:

~~~ts
expect(surface.attributes('data-direction')).toBe('next');
await wrapper.get('[data-action="previous"]').trigger('click');
expect(surface.attributes('data-direction')).toBe('previous');
// After catalog selection:
expect(wrapper.get('[data-role="deck-surface"]').attributes('data-direction')).toBe('direct');
~~~

- [ ] **Step 2: Run tests and confirm `data-direction` is missing**

Run `npm.cmd --prefix apps/freshman-mvp run test:web`.

- [ ] **Step 3: Add minimal direction state**

~~~ts
type TransitionDirection = 'next' | 'previous' | 'direct';
const transitionDirection = ref<TransitionDirection>('next');
~~~

Set `next`, `previous`, or `direct` immediately before the existing successful `selectIndex()` call, then bind:

~~~vue
<div data-role="deck-surface" :data-direction="transitionDirection">
~~~

- [ ] **Step 4: Apply scoped bright card styling and directional cuts**

Scope all overrides under `.deck-page[data-theme="randian-dawn"]`. Use warm page/card surfaces, coral actions, trust-blue links/progress, and:

~~~css
[data-direction="next"] .question-card { animation: question-cut-next 420ms cubic-bezier(.16,1,.3,1) both; }
[data-direction="previous"] .question-card { animation: question-cut-previous 420ms cubic-bezier(.16,1,.3,1) both; }
[data-direction="direct"] .question-card { animation: question-cut-direct 360ms cubic-bezier(.16,1,.3,1) both; }
~~~

Final content is visible without animation; reduced motion disables all three.

- [ ] **Step 5: Run full Web tests**

Run `npm.cmd --prefix apps/freshman-mvp run test:web`.

Expected: navigation, swipes, persistence, catalog, sheets, chat requests, error states, and new direction tests pass.

- [ ] **Step 6: Approval-gated checkpoint**

Do not commit without approval. If approved, commit message: `style(frontend): add cinematic question transitions`.

---

### Task 4: Restage Chat and Student Sheets

**Files:**
- Modify: `apps/freshman-mvp/web/views/ChatView.vue`
- Modify: `apps/freshman-mvp/web/components/QuestionCatalog.vue`
- Modify: `apps/freshman-mvp/web/components/AskSheet.vue`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/question-deck.test.ts`

**Interfaces:** Produces `data-role="answer-stage"`, `data-surface="cinematic-sheet"`, and `.sheet-grab-handle[aria-hidden="true"]`; preserves every dialog/focus/viewport interface.

- [ ] **Step 1: Write failing structure tests**

In the existing successful `/chat` integration case, assert the answer marker. In the existing QuestionCatalog and AskSheet cases, select each dialog root separately and assert its surface and handle:

~~~ts
expect(wrapper.get('[data-role="answer-stage"]').attributes('aria-live')).toBe('polite');

const catalogPanel = wrapper.get('[role="dialog"][aria-labelledby="catalog-title"]');
expect(catalogPanel.attributes('data-surface')).toBe('cinematic-sheet');
expect(catalogPanel.get('.sheet-grab-handle').attributes('aria-hidden')).toBe('true');

const askPanel = wrapper.get('[role="dialog"][aria-labelledby="ask-title"]');
expect(askPanel.attributes('data-surface')).toBe('cinematic-sheet');
expect(askPanel.get('.sheet-grab-handle').attributes('aria-hidden')).toBe('true');
~~~

- [ ] **Step 2: Run tests and confirm markers are absent**

Run `npm.cmd --prefix apps/freshman-mvp run test:web`.

- [ ] **Step 3: Add markers without changing behavior**

Add `data-role="answer-stage"` to the existing successful answer section. Add `data-surface="cinematic-sheet"` to both dialog section roots and this as their first child:

~~~vue
<span class="sheet-grab-handle" aria-hidden="true" />
~~~

- [ ] **Step 4: Add student-only chat/sheet styles**

Scope chat under `.chat-page[data-theme="randian-dawn"]`; scope sheets under `.deck-page[data-theme="randian-dawn"]`. The answer card receives one 480ms transform/opacity entrance, body text is immediately visible, the handle is 42×4px, and submit uses deep coral. Do not change mount/unmount, focus, or keyboard code.

- [ ] **Step 5: Run full Web tests**

Run `npm.cmd --prefix apps/freshman-mvp run test:web`.

Expected: session safety, retries, plain-text rendering, focus traps, Escape, scroll restoration, visual viewport, and new markers pass.

- [ ] **Step 6: Approval-gated checkpoint**

Do not commit without approval. If approved, commit message: `style(frontend): brighten chat and student sheets`.

---

### Task 5: Turn the Guide into a Dawn-Energy Route

**Files:**
- Modify: `apps/freshman-mvp/web/views/GuideView.vue`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/guide-view.test.ts`

**Interfaces:** Produces `data-energy="dawn"` on the signal route and one decorative energy pulse; preserves exactly four ordered stations and all links.

- [ ] **Step 1: Write failing guide assertions**

~~~ts
expect(route.attributes('data-energy')).toBe('dawn');
expect(route.get('.signal-energy-pulse').attributes('aria-hidden')).toBe('true');
~~~

- [ ] **Step 2: Run tests and confirm the dawn contract fails**

Run `npm.cmd --prefix apps/freshman-mvp run test:web`.

- [ ] **Step 3: Add route marker and decorative pulse**

Add `data-energy="dawn"` to the ordered list and place this before the repeated station items:

~~~vue
<span class="signal-energy-pulse" aria-hidden="true" />
~~~

- [ ] **Step 4: Apply scoped guide palette and progressive motion**

Scope all overrides under `.guide-page[data-theme="randian-dawn"]`. Use a bright launch-platform hero, coral nodes/actions, subtitle-paper stations, and sun-gold route glow. Author stations visible by default, then enhance:

~~~css
@supports (animation-timeline: view()) {
  .guide-page[data-theme="randian-dawn"] .guide-signal-station {
    animation: station-light 1s both;
    animation-timeline: view();
    animation-range: entry 12% cover 34%;
  }
}
~~~

Reduced motion hides the pulse and removes station animation.

- [ ] **Step 5: Run full Web tests**

Run `npm.cmd --prefix apps/freshman-mvp run test:web`.

Expected: all tests pass and the route still contains exactly four stations.

- [ ] **Step 6: Approval-gated checkpoint**

Do not commit without approval. If approved, commit message: `style(frontend): warm the freshman signal route`.

---

### Task 6: Full Verification and Scope Audit

**Files:** Verify every file above; update the finesse CSS stamp and ignored local log only after all gates pass.

**Interfaces:** Consumes all five deliverables and produces one verified student-only redesign.

- [ ] **Step 1: Run automated gates separately**

~~~powershell
npm.cmd --prefix apps/freshman-mvp run test:web
npm.cmd run build
npm.cmd --prefix apps/freshman-mvp run build:trial
git diff --check
~~~

Expected: all tests pass, both builds exit 0, no whitespace errors.

- [ ] **Step 2: Prove protected files are untouched**

~~~powershell
git diff --name-only -- apps/freshman-mvp/web/router.ts apps/freshman-mvp/web/api.ts apps/freshman-mvp/web/views/AdminView.vue apps/freshman-mvp/web/components/AdminAnswerEditor.vue apps/freshman-mvp/web/components/AdminIntentList.vue apps/freshman-mvp/web/components/AdminReviewQueue.vue package.json package-lock.json apps/freshman-mvp/package.json apps/freshman-mvp/vite.config.ts PRODUCT.md DESIGN.md
~~~

Expected: no output.

- [ ] **Step 3: Run browser verification**

Start `npm.cmd --prefix apps/freshman-mvp run dev:ui -- --host 127.0.0.1` and inspect `/`, `/questions`, `/chat`, `/guide` at 320×640, 375×844, 390×844, 430×844, and desktop-centered phone width.

For every route check horizontal overflow, last-row clearance, CTA visibility, console errors, focus, contrast, safe areas, and load/empty/error/retry/dialog states.

- [ ] **Step 4: Verify motion and fallbacks**

Normal mode: exactly one canvas on welcome and none downstream. WebGL failure: static campus, countdown, and CTA remain. Reduced motion: canvas is skipped and all content is immediately visible. At 640px, no bottom action overlaps content. With a soft keyboard, textarea and submit remain reachable.

- [ ] **Step 5: Record the successful build**

Replace the first finesse stamp in `tokens.css` with:

~~~css
/* finesse · register=h5 · morph=ambient+deck+longform · A=warm-paper+randian-coral
 * B=display-numerals+system-sans · C=film-opening+reading-cards+signal-route
 * D=WebGL-exposure+CSS-state+view-timeline · E=sunrise-film
 * SOUL=9 SPECTACLE=8 DENSITY=5 */
~~~

Prepend a matching entry to ignored `.finesse/log.json`, keeping 20 entries maximum; do not stage `.finesse/`.

- [ ] **Step 6: Final approval-gated checkpoint**

Report `git status --short`, `git diff --stat`, test counts, build results, browser-size results, and limitations. Do not commit or push without explicit user approval. If approved, use one scoped commit with message `style(frontend): brighten freshman cinematic experience`; pushing and PR creation require separate requests.
