<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import ArrivalLightfall from '../components/ArrivalLightfall.vue';
import { getCountdown, SCHOOL_START_AT } from '../countdown.js';

const targetMs = Date.parse(SCHOOL_START_AT);
const logoPath = '/brand/randian-studio-logo.png';
const nowMs = ref(Date.now());
const countdown = computed(() => getCountdown(targetMs, nowMs.value));
const timerLabel = computed(() => (
  `距离开学还有${countdown.value.days}天${countdown.value.hours}小时`
  + `${countdown.value.minutes}分${countdown.value.seconds}秒`
));
let intervalId: ReturnType<typeof setInterval> | undefined;

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

onMounted(() => {
  intervalId = setInterval(() => {
    nowMs.value = Date.now();
  }, 1_000);
});

onUnmounted(() => {
  if (intervalId !== undefined) clearInterval(intervalId);
});
</script>

<template>
  <main class="welcome-page" data-theme="randian-dawn">
    <div class="welcome-scene" data-scene-grade="bright-dawn" aria-hidden="true">
      <ArrivalLightfall />
      <div class="welcome-cinema-aperture" data-role="cinema-aperture" aria-hidden="true">
        <span class="film-focus-ring film-focus-ring-outer" data-role="film-focus-ring" />
        <span class="film-focus-ring film-focus-ring-middle" data-role="film-focus-ring" />
        <span class="film-focus-ring film-focus-ring-inner" data-role="film-focus-ring" />
        <span class="film-frame-line film-frame-line-top" />
        <span class="film-frame-line film-frame-line-bottom" />
      </div>
      <span class="welcome-exposure-horizon" data-role="exposure-horizon" aria-hidden="true" />
    </div>

    <header class="welcome-brand">
      <img :src="logoPath" alt="燃点工作室">
      <div class="welcome-brand-lockup">
        <span>LIVE IN HDU</span>
        <small aria-hidden="true"><i /> ARRIVAL SIGNAL · ONLINE</small>
      </div>
    </header>

    <section class="welcome-stage">
      <section class="welcome-copy">
        <h1 v-if="!countdown.complete">距离开学，还有</h1>
        <h1 v-else role="status">开学啦</h1>
      </section>

      <section class="countdown-grid" role="timer" :aria-label="timerLabel">
        <div class="countdown-card" data-unit="days">
          <strong data-role="value">{{ countdown.days }}</strong>
          <span>天</span>
        </div>
        <i aria-hidden="true">:</i>
        <div class="countdown-card" data-unit="hours">
          <strong data-role="value">{{ twoDigits(countdown.hours) }}</strong>
          <span>时</span>
        </div>
        <i aria-hidden="true">:</i>
        <div class="countdown-card" data-unit="minutes">
          <strong data-role="value">{{ twoDigits(countdown.minutes) }}</strong>
          <span>分</span>
        </div>
        <i aria-hidden="true">:</i>
        <div class="countdown-card countdown-card-seconds" data-unit="seconds">
          <strong :key="countdown.seconds" data-role="value">{{ twoDigits(countdown.seconds) }}</strong>
          <span>秒</span>
        </div>
      </section>
    </section>

    <footer class="welcome-footer">
      <p>北京时间 2026.09.16 00:00</p>
      <RouterLink :to="{ name: 'deck' }" data-action="enter-deck">
        <span>进入新生问答</span>
        <i aria-hidden="true" />
      </RouterLink>
    </footer>
  </main>
</template>

<style scoped>
@font-face {
  font-family: "HDU Arrival Display";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/hdu-arrival-display.woff2") format("woff2");
}

.welcome-page {
  --arrival-coral: #b83f32;
  --arrival-coral-bright: #ef6b4f;
  --arrival-ink: #3d291f;
  --arrival-paper: #fff2d8;
  --arrival-sun: #ffc66e;
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(100%, 430px);
  min-height: 100svh;
  min-height: 100dvh;
  margin: 0 auto;
  overflow: hidden;
  padding:
    max(22px, env(safe-area-inset-top))
    max(22px, env(safe-area-inset-right))
    max(20px, env(safe-area-inset-bottom))
    max(22px, env(safe-area-inset-left));
  color: #fff9ec;
  background: #82776c;
  box-shadow: 0 0 70px rgb(87 46 27 / 22%);
}

.welcome-page::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 4%, rgb(255 248 226 / 22%) 4.2%, transparent 4.4% 95.6%, rgb(255 248 226 / 22%) 95.8%, transparent 96%),
    repeating-linear-gradient(0deg, rgb(75 36 19 / 3%) 0 1px, transparent 1px 5px);
  content: "";
  opacity: 0.58;
}

.welcome-scene {
  position: absolute;
  z-index: -2;
  inset: 0;
  overflow: hidden;
  background:
    #a3b2ad
    url("/brand/campus-dawn-welcome.webp") center bottom / cover no-repeat;
  filter: brightness(1.18) saturate(1.08) contrast(0.96);
}

.welcome-scene::before,
.welcome-scene::after {
  position: absolute;
  z-index: 1;
  inset: 0;
  pointer-events: none;
  content: "";
}

.welcome-scene::before {
  background:
    radial-gradient(circle at 74% 19%, rgb(255 224 152 / 62%) 0 10%, transparent 36%),
    linear-gradient(180deg, rgb(255 226 183 / 16%) 0%, transparent 38%),
    radial-gradient(circle at 50% 52%, transparent 0 36%, rgb(121 70 43 / 7%) 76%, rgb(72 48 38 / 16%) 100%);
}

.welcome-scene::after {
  background:
    linear-gradient(180deg, rgb(75 74 68 / 4%) 0%, transparent 46%),
    linear-gradient(180deg, transparent 60%, rgb(102 62 43 / 5%) 74%, rgb(54 39 34 / 42%) 100%);
}

.welcome-scene :deep(.arrival-lightfall) {
  z-index: 2;
  height: 76%;
  filter: saturate(1.18) brightness(1.08);
}

.welcome-cinema-aperture {
  position: absolute;
  z-index: 3;
  top: 51%;
  left: 50%;
  width: min(132vw, 560px);
  aspect-ratio: 1;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: aperture-settle 1.15s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.film-focus-ring {
  position: absolute;
  border: 1px solid;
  border-radius: 50%;
  transform: rotate(-13deg);
}

.film-focus-ring-outer {
  inset: 0;
  border-color:
    rgb(255 244 215 / 44%)
    transparent
    rgb(255 183 103 / 38%)
    rgb(255 244 215 / 20%);
}

.film-focus-ring-middle {
  inset: 15%;
  border-color:
    transparent
    rgb(255 237 200 / 44%)
    rgb(239 107 79 / 32%)
    transparent;
  transform: rotate(21deg);
}

.film-focus-ring-inner {
  inset: 31%;
  border-color:
    rgb(255 211 145 / 50%)
    transparent
    transparent
    rgb(255 249 232 / 34%);
  transform: rotate(-31deg);
}

.film-frame-line {
  position: absolute;
  right: 17%;
  left: 17%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(255 244 218 / 56%) 16% 84%, transparent);
}

.film-frame-line-top { top: 21%; }
.film-frame-line-bottom { bottom: 21%; }

.welcome-exposure-horizon {
  position: absolute;
  z-index: 3;
  top: 58%;
  right: -12%;
  left: -12%;
  height: 2px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgb(255 244 209 / 88%) 34% 66%, transparent);
  box-shadow:
    0 0 16px rgb(255 199 108 / 74%),
    0 0 44px rgb(239 107 79 / 34%);
  transform-origin: center;
  animation: exposure-horizon-sweep 1.35s 120ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.welcome-brand {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  animation: reveal-brand 620ms 80ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.welcome-brand img {
  position: relative;
  width: 46px;
  height: 46px;
  border: 1px solid rgb(255 247 225 / 68%);
  border-radius: 50%;
  object-fit: contain;
  box-shadow:
    0 0 0 5px rgb(255 211 144 / 13%),
    0 0 28px rgb(255 190 96 / 22%),
    0 8px 24px rgb(72 36 23 / 24%);
}

.welcome-brand-lockup {
  display: grid;
  gap: 5px;
}

.welcome-brand-lockup > span {
  color: #fff9ec;
  font-size: 1rem;
  font-weight: 820;
  letter-spacing: 0.08em;
  text-shadow: 0 2px 16px rgb(57 35 29 / 58%);
}

.welcome-brand-lockup small {
  display: flex;
  align-items: center;
  color: rgb(255 237 205 / 79%);
  font-family: "Arial Narrow", sans-serif;
  font-size: 0.52rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  line-height: 1;
}

.welcome-brand-lockup small i {
  width: 5px;
  height: 5px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--arrival-sun);
  box-shadow: 0 0 8px 2px rgb(255 183 90 / 46%);
}

.welcome-stage {
  position: relative;
  z-index: 4;
  display: grid;
  align-self: center;
  gap: clamp(16px, 3dvh, 30px);
  width: 100%;
  padding-block: clamp(20px, 5dvh, 58px);
}

.welcome-copy {
  margin: 0;
  animation: reveal-copy 720ms 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.welcome-copy::before {
  display: block;
  margin-bottom: 9px;
  color: rgb(255 231 192 / 82%);
  font-family: "Arial Narrow", sans-serif;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-shadow: 0 2px 12px rgb(55 34 29 / 62%);
  content: "HDU ARRIVAL · SIGNAL LOCKED";
}

.welcome-copy h1 {
  margin: 0;
  color: #fff9ec;
  font-family: "HDU Arrival Display", "PingFang SC", sans-serif;
  font-size: clamp(2rem, 9.5vw, 2.8rem);
  font-weight: 400;
  letter-spacing: -0.035em;
  line-height: 1.12;
  text-shadow:
    0 2px 2px rgb(71 38 26 / 24%),
    0 8px 28px rgb(56 35 30 / 46%);
  white-space: nowrap;
}

.countdown-grid {
  position: relative;
  z-index: 4;
  display: grid;
  grid-template-columns:
    minmax(0, 1fr) 8px minmax(0, 1fr) 8px
    minmax(0, 1fr) 8px minmax(0, 1fr);
  align-items: center;
  gap: clamp(3px, 1.2vw, 6px);
  perspective: 720px;
}

.countdown-card {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  align-content: center;
  min-width: 0;
  min-height: clamp(96px, 13dvh, 116px);
  padding: 10px 2px 9px;
  overflow: hidden;
  border: 1px solid rgb(255 241 213 / 84%);
  border-radius: 9px;
  color: var(--arrival-ink);
  background:
    repeating-linear-gradient(0deg, rgb(99 60 39 / 3%) 0 1px, transparent 1px 4px),
    linear-gradient(153deg, rgb(255 249 232 / 98%) 0%, rgb(255 238 205 / 96%) 100%);
  box-shadow:
    0 18px 36px rgb(70 38 25 / 25%),
    0 0 0 1px rgb(184 92 60 / 7%),
    inset 0 1px rgb(255 253 243 / 95%),
    inset 0 -10px 22px rgb(190 99 62 / 5%);
  transform-origin: center bottom;
  animation: subtitle-card-arrival 720ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.countdown-card::before,
.countdown-card::after {
  position: absolute;
  pointer-events: none;
  content: "";
}

.countdown-card::before {
  top: 7px;
  right: 7px;
  bottom: 7px;
  left: 7px;
  border-top: 1px solid rgb(184 63 50 / 24%);
  border-bottom: 1px solid rgb(184 63 50 / 16%);
}

.countdown-card::after {
  top: 50%;
  right: 0;
  left: 0;
  height: 1px;
  background: rgb(126 77 50 / 8%);
}

.countdown-card:nth-of-type(1) { animation-delay: 360ms; }
.countdown-card:nth-of-type(2) { animation-delay: 430ms; }
.countdown-card:nth-of-type(3) { animation-delay: 500ms; }
.countdown-card:nth-of-type(4) { animation-delay: 570ms; }

.countdown-card strong {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: var(--arrival-coral);
  font-family: "HDU Arrival Display", "Arial Narrow", sans-serif;
  font-size: clamp(2.35rem, 11.5vw, 3.35rem);
  font-variant-numeric: tabular-nums;
  font-weight: 400;
  letter-spacing: -0.04em;
  line-height: 0.98;
}

.countdown-card span {
  margin-top: 6px;
  font-size: 0.78rem;
  font-weight: 820;
  line-height: 1;
}

.countdown-grid > i {
  position: relative;
  z-index: 3;
  color: rgb(255 243 218 / 92%);
  font-family: "HDU Arrival Display", sans-serif;
  font-size: 1.65rem;
  font-style: normal;
  font-weight: 700;
  text-align: center;
  text-shadow: 0 3px 12px rgb(61 37 30 / 42%);
}

.countdown-card-seconds strong {
  animation: second-step 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.welcome-footer {
  position: relative;
  z-index: 5;
  padding-top: clamp(12px, 3dvh, 30px);
  text-align: center;
  animation: reveal-action 760ms 680ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.welcome-footer::before {
  position: absolute;
  top: 24px;
  left: 50%;
  width: 1px;
  height: clamp(76px, 12dvh, 124px);
  background: linear-gradient(180deg, transparent, rgb(255 222 166 / 72%), transparent);
  box-shadow: 0 0 12px rgb(255 187 91 / 28%);
  content: "";
  transform: translateX(-50%);
  transform-origin: center top;
  animation: signal-drop 1.1s 760ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.welcome-footer p {
  margin: 0 0 10px;
  color: rgb(255 239 210 / 82%);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-shadow: 0 2px 12px rgb(56 35 29 / 68%);
}

.welcome-footer a {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 13px;
  overflow: hidden;
  width: 100%;
  min-height: 58px;
  padding: 15px 18px;
  border: 1px solid rgb(255 228 196 / 24%);
  border-radius: 12px;
  color: #fff9ec;
  background:
    radial-gradient(circle at 50% 0%, rgb(255 164 121 / 24%), transparent 55%),
    linear-gradient(135deg, #bd4938 0%, #a9342b 100%);
  box-shadow:
    0 16px 34px rgb(72 34 25 / 38%),
    0 0 28px rgb(184 63 50 / 19%),
    inset 0 1px rgb(255 246 229 / 27%);
  font-size: 1.04rem;
  font-weight: 820;
  letter-spacing: 0.04em;
  text-decoration: none;
  transition: transform 180ms ease;
}

.welcome-footer a::before {
  position: absolute;
  top: -85%;
  left: 0;
  width: 30%;
  height: 270%;
  background: linear-gradient(90deg, transparent, rgb(255 244 219 / 43%), transparent);
  content: "";
  transform: translateX(-180%) rotate(18deg);
  animation: action-scan 4.6s 1.8s ease-in-out infinite;
}

.welcome-footer a span,
.welcome-footer a i {
  position: relative;
  z-index: 1;
}

.welcome-footer a i {
  width: 25px;
  height: 25px;
  border: 1px solid rgb(255 242 218 / 38%);
  border-radius: 50%;
  box-shadow: inset 0 0 12px rgb(255 244 219 / 8%);
}

.welcome-footer a i::before,
.welcome-footer a i::after {
  position: absolute;
  top: 50%;
  content: "";
}

.welcome-footer a i::before {
  right: 6px;
  left: 6px;
  height: 1px;
  background: #fff9ec;
  transform: translateY(-50%);
}

.welcome-footer a i::after {
  right: 6px;
  width: 5px;
  height: 5px;
  border-top: 1px solid #fff9ec;
  border-right: 1px solid #fff9ec;
  transform: translateY(-50%) rotate(45deg);
}

.welcome-footer a:active {
  transform: translateY(1px);
  box-shadow:
    0 10px 22px rgb(72 34 25 / 34%),
    inset 0 1px rgb(255 246 229 / 22%);
}

@keyframes reveal-brand {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes reveal-copy {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes reveal-action {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes second-step {
  from { clip-path: inset(0 0 18% 0); transform: translateY(-3px); }
  to { clip-path: inset(0); transform: translateY(0); }
}

@keyframes aperture-settle {
  from { opacity: 0; transform: translate(-50%, -50%) scale(1.08); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes exposure-horizon-sweep {
  from { opacity: 0; transform: scaleX(0.12); }
  46% { opacity: 1; }
  to { opacity: 0.72; transform: scaleX(1); }
}

@keyframes subtitle-card-arrival {
  from { opacity: 0; transform: translateY(24px) rotateX(-12deg) scale(0.92); }
  to { opacity: 1; transform: translateY(0) rotateX(0) scale(1); }
}

@keyframes signal-drop {
  from { opacity: 0; transform: translateX(-50%) scaleY(0); }
  to { opacity: 1; transform: translateX(-50%) scaleY(1); }
}

@keyframes action-scan {
  0%, 58% { opacity: 0; transform: translateX(-180%) rotate(18deg); }
  64% { opacity: 1; }
  82%, 100% { opacity: 0; transform: translateX(480%) rotate(18deg); }
}

@media (max-width: 350px) {
  .welcome-page {
    padding-right: max(17px, env(safe-area-inset-right));
    padding-left: max(17px, env(safe-area-inset-left));
  }

  .welcome-brand img {
    width: 42px;
    height: 42px;
  }

  .welcome-brand-lockup > span {
    font-size: 0.9rem;
  }

  .welcome-brand-lockup small {
    font-size: 0.48rem;
  }

  .countdown-grid {
    grid-template-columns:
      minmax(0, 1fr) 5px minmax(0, 1fr) 5px
      minmax(0, 1fr) 5px minmax(0, 1fr);
    gap: 3px;
  }

  .countdown-card {
    border-radius: 14px;
  }

  .welcome-cinema-aperture {
    width: 132vw;
  }
}

@media (max-height: 760px) {
  .welcome-page {
    padding-top: max(17px, env(safe-area-inset-top));
    padding-bottom: max(14px, env(safe-area-inset-bottom));
  }

  .welcome-copy {
    margin: 0;
  }

  .welcome-copy h1 {
    font-size: clamp(1.82rem, 8.8vw, 2.3rem);
  }

  .countdown-card {
    min-height: 86px;
  }

  .countdown-card strong {
    font-size: clamp(2.1rem, 10.5vw, 2.8rem);
  }

  .welcome-stage {
    gap: 13px;
    padding-block: clamp(12px, 2.5dvh, 22px);
  }

  .welcome-footer a {
    min-height: 54px;
  }

  .welcome-cinema-aperture {
    top: 52%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-brand,
  .welcome-copy,
  .countdown-card,
  .countdown-card-seconds strong,
  .welcome-footer,
  .welcome-cinema-aperture,
  .welcome-exposure-horizon,
  .welcome-footer::before,
  .welcome-footer a::before {
    animation: none;
  }

  .welcome-footer a::before {
    display: none;
  }

  .welcome-exposure-horizon {
    opacity: 0.72;
    transform: scaleX(1);
  }

  .welcome-footer a {
    transition: none;
  }
}
</style>
