<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Mesh, Program, Renderer, Triangle } from 'ogl';

const props = withDefaults(defineProps<{
  paused?: boolean;
  reducedMotion?: boolean;
}>(), {
  paused: false,
  reducedMotion: undefined,
});

const DPR_CAP = 1.5;
const root = ref<HTMLDivElement>();
let renderer: Renderer | undefined;
let program: Program | undefined;
let geometry: Triangle | undefined;
let mesh: Mesh | undefined;
let resizeObserver: ResizeObserver | undefined;
let frameId: number | undefined;
let pageHidden = false;

const vertex = /* glsl */ `
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uIntensity;
  uniform float uPulse;
  uniform float uConvergence;
  uniform float uHorizon;
  uniform float uWarmth;
  uniform float uExposure;
  uniform vec2 uResolution;
  varying vec2 vUv;

  float meteor(
    vec2 uv,
    vec2 origin,
    vec2 direction,
    float length,
    float width,
    float strength
  ) {
    vec2 perpendicular = vec2(-direction.y, direction.x);
    vec2 delta = uv - origin;
    float along = dot(delta, direction);
    float across = abs(dot(delta, perpendicular));
    float core = exp(-across * across / (width * width));
    float haloWidth = width * 4.2;
    float halo = exp(-across * across / (haloWidth * haloWidth));
    float tail = smoothstep(-length, 0.0, along) * smoothstep(0.012, 0.0, along);
    float headRadius = width * 2.15;
    float head = exp(-dot(delta, delta) / max(headRadius * headRadius, 0.000004));
    return ((core * 0.92 + halo * 0.22) * tail + head * 1.2) * strength;
  }

  float fallingLight(
    vec2 uv,
    float aspect,
    float offset,
    float lane,
    float pace,
    float length,
    float width,
    float strength,
    float depth
  ) {
    float resolvedDepth = clamp(depth, 0.0, 1.0);
    float depthScale = mix(0.55, 1.35, resolvedDepth);
    float depthPace = pace * mix(0.74, 1.20, resolvedDepth);
    float phase = fract(uTime * uSpeed * depthPace + offset);
    vec2 freeOrigin = vec2(
      mix(-0.18, aspect + 0.18, phase),
      mix(1.12, -0.10, phase) + lane
    );
    float sourceIndex = fract(offset * 7.13 + depth * 0.37);
    vec2 source = vec2(
      mix(-0.10, aspect + 0.10, sourceIndex),
      1.12 + depth * 0.10
    );
    vec2 target = vec2(
      aspect * (0.50 + lane * 0.14),
      uHorizon + abs(lane) * 0.035
    );
    vec2 convergenceDirection = normalize(target - source);
    vec2 convergenceOrigin = mix(source, target, smoothstep(0.0, 0.96, phase));
    vec2 freeDirection = normalize(vec2(aspect + 0.36, -1.22));
    vec2 direction = normalize(mix(freeDirection, convergenceDirection, uConvergence));
    vec2 origin = mix(freeOrigin, convergenceOrigin, uConvergence);
    float resolvedLength = length * depthScale;
    float resolvedWidth = width * depthScale;
    float resolvedStrength = strength * mix(0.42, 1.18, resolvedDepth);
    float lifecycle = smoothstep(0.0, 0.08, phase) * (1.0 - smoothstep(0.88, 1.0, phase));
    float shimmer = 1.0 + uPulse * sin(
      uTime * mix(2.2, 3.8, resolvedDepth) + offset * 31.4
    );
    return meteor(
      uv,
      origin,
      direction,
      resolvedLength,
      resolvedWidth,
      resolvedStrength
    ) * lifecycle * shimmer;
  }

  void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 uv = vec2(vUv.x * aspect, vUv.y);
    float light = 0.0;
    light += fallingLight(uv, aspect, 0.02,  0.10, 0.90, 0.19, 0.0019, 0.74, 0.12);
    light += fallingLight(uv, aspect, 0.10, -0.08, 1.05, 0.22, 0.0024, 0.88, 0.48);
    light += fallingLight(uv, aspect, 0.18,  0.18, 0.96, 0.18, 0.0018, 0.70, 0.20);
    light += fallingLight(uv, aspect, 0.26, -0.16, 1.10, 0.23, 0.0026, 0.92, 0.62);
    light += fallingLight(uv, aspect, 0.34,  0.03, 0.86, 0.20, 0.0020, 0.78, 0.28);
    light += fallingLight(uv, aspect, 0.42,  0.23, 1.02, 0.21, 0.0023, 0.84, 0.44);
    light += fallingLight(uv, aspect, 0.50, -0.12, 0.94, 0.27, 0.0032, 1.04, 0.92);
    light += fallingLight(uv, aspect, 0.58,  0.08, 1.08, 0.19, 0.0019, 0.73, 0.16);
    light += fallingLight(uv, aspect, 0.66, -0.03, 0.88, 0.24, 0.0027, 0.95, 0.70);
    light += fallingLight(uv, aspect, 0.74,  0.15, 1.12, 0.18, 0.0018, 0.71, 0.10);
    light += fallingLight(uv, aspect, 0.82, -0.20, 0.98, 0.25, 0.0030, 0.98, 0.86);
    light += fallingLight(uv, aspect, 0.90,  0.04, 1.06, 0.22, 0.0025, 0.89, 0.56);

    float horizonDistance = abs(vUv.y - uHorizon);
    float horizon = exp(-horizonDistance * horizonDistance / 0.00034);
    horizon *= 0.10 + uPulse * 0.08 * (0.5 + 0.5 * sin(uTime * 1.7));

    vec3 cool = vec3(0.70, 0.84, 0.96);
    vec3 ember = vec3(1.0, 0.34, 0.18);
    vec3 sunlight = vec3(1.0, 0.72, 0.32);
    vec3 color = mix(cool, ember, uWarmth * (0.38 + vUv.y * 0.18));
    color = mix(color, sunlight, clamp(horizon * uExposure * 5.0, 0.0, 0.62));
    float alpha = clamp(light * uIntensity + horizon, 0.0, 0.88);
    gl_FragColor = vec4(color, alpha);
  }
`;

function resize() {
  if (!root.value || !renderer || !program) return;
  const bounds = root.value.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  renderer.setSize(width, height);
  program.uniforms.uResolution.value = [
    renderer.gl.drawingBufferWidth,
    renderer.gl.drawingBufferHeight,
  ];
}

function handleVisibilityChange() {
  pageHidden = document.hidden;
}

function animate(time: number) {
  frameId = requestAnimationFrame(animate);
  if (props.paused || pageHidden || !renderer || !program || !mesh) return;
  program.uniforms.uTime.value = time * 0.001;
  renderer.render({ scene: mesh });
}

function prefersReducedMotion() {
  if (props.reducedMotion !== undefined) return props.reducedMotion;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function teardown() {
  if (frameId !== undefined) cancelAnimationFrame(frameId);
  frameId = undefined;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  resizeObserver?.disconnect();
  program?.remove();
  geometry?.remove();

  const activeRenderer = renderer;
  const canvas = activeRenderer?.gl.canvas;
  if (canvas && canvas.parentElement === root.value) canvas.remove();
  activeRenderer?.gl.getExtension?.('WEBGL_lose_context')?.loseContext();
  (activeRenderer as (Renderer & { destroy?: () => void }) | undefined)?.destroy?.();

  renderer = undefined;
  program = undefined;
  geometry = undefined;
  mesh = undefined;
  resizeObserver = undefined;
}

onMounted(() => {
  if (!root.value || prefersReducedMotion()) return;

  try {
    renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio || 1, DPR_CAP),
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
    });
    const gl = renderer.gl;
    const canvas = gl.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    root.value.appendChild(canvas);

    program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 0.18 },
        uIntensity: { value: 0.9 },
        uPulse: { value: 0.26 },
        uConvergence: { value: 0.72 },
        uHorizon: { value: 0.16 },
        uWarmth: { value: 0.68 },
        uExposure: { value: 0.22 },
        uResolution: { value: [1, 1] },
      },
    });
    geometry = new Triangle(gl);
    mesh = new Mesh(gl, { geometry, program });

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root.value);
    resize();
    pageHidden = document.hidden;
    document.addEventListener('visibilitychange', handleVisibilityChange);
    frameId = requestAnimationFrame(animate);
  } catch {
    teardown();
  }
});

onUnmounted(() => {
  teardown();
});
</script>

<template>
  <div
    ref="root"
    class="arrival-lightfall"
    data-role="arrival-lightfall"
    aria-hidden="true"
  />
</template>

<style scoped>
.arrival-lightfall {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.arrival-lightfall :deep(canvas) {
  opacity: 1;
}
</style>
