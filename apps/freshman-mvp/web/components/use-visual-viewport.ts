import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue';

export interface ViewportMetrics {
  height: number;
  offsetTop: number;
}

export function readViewportMetrics(windowValue: Window): ViewportMetrics {
  return {
    height: windowValue.visualViewport?.height ?? windowValue.innerHeight,
    offsetTop: windowValue.visualViewport?.offsetTop ?? 0,
  };
}

export function useVisualViewport(panel: Ref<HTMLElement | null>): {
  viewportStyle: ComputedRef<Record<string, string>>;
  revealInput(element: HTMLElement): void;
} {
  const metrics = ref(readViewportMetrics(window));
  let revealTimer: number | undefined;
  let visualViewport: VisualViewport | null = null;

  function updateMetrics(): void {
    metrics.value = readViewportMetrics(window);
  }

  function revealInput(element: HTMLElement): void {
    element.focus();
    if (revealTimer !== undefined) {
      window.clearTimeout(revealTimer);
    }
    revealTimer = window.setTimeout(() => {
      if (panel.value?.contains(element)) {
        element.scrollIntoView({ block: 'nearest' });
      }
      revealTimer = undefined;
    }, 50);
  }

  const viewportStyle = computed(() => ({
    '--visual-viewport-height': `${metrics.value.height}px`,
    '--visual-viewport-offset-top': `${metrics.value.offsetTop}px`,
  }));

  onMounted(() => {
    visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', updateMetrics);
    visualViewport?.addEventListener('scroll', updateMetrics);
  });

  onUnmounted(() => {
    visualViewport?.removeEventListener('resize', updateMetrics);
    visualViewport?.removeEventListener('scroll', updateMetrics);
    if (revealTimer !== undefined) {
      window.clearTimeout(revealTimer);
    }
  });

  return { viewportStyle, revealInput };
}
