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
  <main class="welcome-page">
    <div class="welcome-scene" aria-hidden="true">
      <ArrivalLightfall />
    </div>

    <header class="welcome-brand">
      <img :src="logoPath" alt="燃点工作室">
      <span>LIVE IN HDU</span>
    </header>

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

    <footer class="welcome-footer">
      <p>北京时间 2026.09.16 00:00</p>
      <RouterLink :to="{ name: 'deck' }" data-action="enter-deck">
        进入新生问答
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
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  width: min(100%, 430px);
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0 auto;
  overflow: hidden;
  padding:
    max(22px, env(safe-area-inset-top))
    max(22px, env(safe-area-inset-right))
    max(20px, env(safe-area-inset-bottom))
    max(22px, env(safe-area-inset-left));
  color: #f8fbff;
  background: #04152f;
}

.welcome-scene {
  position: absolute;
  z-index: -2;
  inset: 0;
  overflow: hidden;
  background:
    #04152f
    url("/brand/campus-dawn-welcome.webp") center bottom / cover no-repeat;
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
    linear-gradient(180deg, rgb(2 13 31 / 14%) 0%, transparent 44%),
    radial-gradient(circle at 50% 46%, transparent 0 28%, rgb(1 12 29 / 15%) 72% 100%);
}

.welcome-scene::after {
  background: linear-gradient(180deg, transparent 70%, rgb(2 17 38 / 5%) 81%, rgb(2 17 38 / 72%) 100%);
}

.welcome-scene :deep(.arrival-lightfall) {
  z-index: 2;
  height: 64%;
}

.welcome-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  animation: reveal-brand 620ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.welcome-brand img {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  object-fit: contain;
  box-shadow: 0 8px 24px rgb(0 7 20 / 25%);
}

.welcome-brand span {
  color: #fff;
  font-size: 1rem;
  font-weight: 820;
  letter-spacing: 0.08em;
  text-shadow: 0 2px 16px rgb(0 8 24 / 55%);
}

.welcome-copy {
  align-self: end;
  margin-bottom: clamp(18px, 3dvh, 28px);
  animation: reveal-copy 720ms 100ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.welcome-copy h1 {
  margin: 0;
  color: #fff;
  font-family: "HDU Arrival Display", "PingFang SC", sans-serif;
  font-size: clamp(2rem, 9.5vw, 2.8rem);
  font-weight: 400;
  letter-spacing: -0.035em;
  line-height: 1.12;
  text-shadow: 0 4px 24px rgb(0 11 32 / 45%);
  white-space: nowrap;
}

.countdown-grid {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr) 8px minmax(0, 1fr) 8px
    minmax(0, 1fr) 8px minmax(0, 1fr);
  align-items: center;
  gap: clamp(3px, 1.2vw, 6px);
  animation: reveal-clock 760ms 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.countdown-card {
  display: grid;
  place-items: center;
  align-content: center;
  min-width: 0;
  min-height: clamp(96px, 13dvh, 116px);
  padding: 10px 2px 9px;
  border: 1px solid rgb(255 255 255 / 78%);
  border-radius: 16px;
  color: #0b3568;
  background: rgb(249 251 255 / 96%);
  box-shadow:
    0 16px 34px rgb(0 13 38 / 24%),
    inset 0 1px rgb(255 255 255 / 92%);
}

.countdown-card strong {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: #c9442e;
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
  color: rgb(255 255 255 / 88%);
  font-family: "HDU Arrival Display", sans-serif;
  font-size: 1.65rem;
  font-style: normal;
  font-weight: 700;
  text-align: center;
  text-shadow: 0 3px 12px rgb(0 13 38 / 40%);
}

.countdown-card-seconds strong {
  animation: second-step 160ms cubic-bezier(0.16, 1, 0.3, 1);
}

.welcome-footer {
  position: relative;
  z-index: 2;
  padding-top: clamp(132px, 19dvh, 190px);
  text-align: center;
  animation: reveal-action 760ms 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.welcome-footer p {
  margin: 0 0 10px;
  color: rgb(255 255 255 / 72%);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-shadow: 0 2px 12px rgb(0 10 28 / 65%);
}

.welcome-footer a {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 58px;
  padding: 15px 18px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 14px;
  color: #fff;
  background: #c9442e;
  box-shadow:
    0 14px 32px rgb(0 12 34 / 35%),
    inset 0 1px rgb(255 255 255 / 22%);
  font-size: 1.04rem;
  font-weight: 820;
  letter-spacing: 0.04em;
  text-decoration: none;
  transition: background-color 160ms ease, transform 160ms ease;
}

.welcome-footer a:active {
  background: #b83b28;
  transform: translateY(1px);
}

@keyframes reveal-brand {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes reveal-copy {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes reveal-clock {
  from { opacity: 0; transform: translateY(18px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes reveal-action {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes second-step {
  from { clip-path: inset(0 0 18% 0); transform: translateY(-3px); }
  to { clip-path: inset(0); transform: translateY(0); }
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

  .welcome-brand span {
    font-size: 0.9rem;
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
}

@media (max-height: 760px) {
  .welcome-page {
    padding-top: max(17px, env(safe-area-inset-top));
    padding-bottom: max(14px, env(safe-area-inset-bottom));
  }

  .welcome-copy {
    margin-bottom: 13px;
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

  .welcome-footer {
    padding-top: clamp(88px, 15dvh, 116px);
  }

  .welcome-footer a {
    min-height: 54px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-brand,
  .welcome-copy,
  .countdown-grid,
  .countdown-card-seconds strong,
  .welcome-footer {
    animation: none;
  }

  .welcome-footer a {
    transition: none;
  }
}
</style>
