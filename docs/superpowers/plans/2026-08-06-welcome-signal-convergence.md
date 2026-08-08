# Welcome Signal Convergence Implementation Plan

**Goal:** Turn the existing freshman countdown into a cinematic signal-convergence entrance while preserving the timer, route, assets, accessibility, and graceful WebGL fallback.

## Scope

- Enhance `WelcomeView.vue` with decorative signal-lock layers and a four-beat entrance sequence.
- Enhance `ArrivalLightfall.vue` so meteor trails visually converge toward the countdown/horizon instead of reading as unrelated streaks.
- Keep all decorative motion out of the accessibility tree and disable it under reduced-motion preferences.
- Do not change the question deck, router, API, dependencies, build configuration, or countdown contract.

## Verification

1. Add focused component tests before implementation and confirm they fail.
2. Implement the smallest markup, shader, and CSS changes that make those tests pass.
3. Run the focused tests, then the complete web test suite and production builds.
4. Verify 320px, 390px, 430px, reduced-motion, and desktop-centered layouts in a browser.
