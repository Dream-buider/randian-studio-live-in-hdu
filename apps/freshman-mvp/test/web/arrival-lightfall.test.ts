// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArrivalLightfall from '../../web/components/ArrivalLightfall.vue';

const ogl = vi.hoisted(() => ({
  destroy: vi.fn(),
  remove: vi.fn(),
  render: vi.fn(),
  programUniforms: undefined as Record<string, { value: unknown }> | undefined,
  programShouldThrow: false,
  rendererShouldThrow: false,
}));

vi.mock('ogl', () => {
  class Renderer {
    dpr = 1;
    gl: {
      canvas: HTMLCanvasElement;
      drawingBufferWidth: number;
      drawingBufferHeight: number;
      clearColor: ReturnType<typeof vi.fn>;
    };

    constructor() {
      if (ogl.rendererShouldThrow) throw new Error('WebGL unavailable');
      this.gl = {
        canvas: document.createElement('canvas'),
        drawingBufferWidth: 390,
        drawingBufferHeight: 500,
        clearColor: vi.fn(),
      };
    }

    setSize() {}
    render() { ogl.render(); }
    destroy() { ogl.destroy(); }
  }

  class Program {
    uniforms: Record<string, { value: unknown }>;
    constructor(_gl: unknown, options: { uniforms: Record<string, { value: unknown }> }) {
      if (ogl.programShouldThrow) throw new Error('Shader compilation failed');
      this.uniforms = options.uniforms;
      ogl.programUniforms = options.uniforms;
    }
    remove() { ogl.remove(); }
  }

  class Triangle {
    remove() { ogl.remove(); }
  }

  class Mesh {
    remove() { ogl.remove(); }
  }

  return { Renderer, Program, Triangle, Mesh };
});

const resizeDisconnect = vi.fn();
let frameCallback: FrameRequestCallback | undefined;

beforeEach(() => {
  ogl.rendererShouldThrow = false;
  ogl.programShouldThrow = false;
  ogl.programUniforms = undefined;
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() { resizeDisconnect(); }
  });
  frameCallback = undefined;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frameCallback = callback;
    return 17;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ArrivalLightfall', () => {
  it('renders a decorative non-interactive dynamic layer', () => {
    const wrapper = mount(ArrivalLightfall);

    expect(wrapper.get('[data-role="arrival-lightfall"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('canvas').exists()).toBe(true);

    wrapper.unmount();
  });

  it('provides a fast depth-aware mobile motion profile to the shader', () => {
    const wrapper = mount(ArrivalLightfall);

    expect(ogl.programUniforms?.uSpeed?.value).toBe(0.18);
    expect(ogl.programUniforms?.uIntensity?.value).toBe(0.9);
    expect(ogl.programUniforms?.uPulse?.value).toBe(0.26);

    wrapper.unmount();
  });

  it('keeps the static layer and skips WebGL for reduced motion', () => {
    const wrapper = mount(ArrivalLightfall, { props: { reducedMotion: true } });

    expect(wrapper.get('[data-role="arrival-lightfall"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('canvas').exists()).toBe(false);

    wrapper.unmount();
  });

  it('cleans up animation and observation when unmounted', () => {
    const wrapper = mount(ArrivalLightfall);

    wrapper.unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(17);
    expect(resizeDisconnect).toHaveBeenCalledOnce();
    expect(ogl.destroy).toHaveBeenCalledOnce();
  });

  it('pauses rendering while the page is hidden', () => {
    const wrapper = mount(ArrivalLightfall);
    expect(frameCallback).toBeTypeOf('function');

    frameCallback?.(16);
    expect(ogl.render).toHaveBeenCalledOnce();

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    frameCallback?.(32);
    expect(ogl.render).toHaveBeenCalledOnce();

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    wrapper.unmount();
  });

  it('falls back without breaking the decorative root when WebGL setup fails', () => {
    ogl.rendererShouldThrow = true;

    const wrapper = mount(ArrivalLightfall);

    expect(wrapper.get('[data-role="arrival-lightfall"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('canvas').exists()).toBe(false);

    wrapper.unmount();
  });

  it('removes an inserted canvas when shader setup fails', () => {
    ogl.programShouldThrow = true;

    const wrapper = mount(ArrivalLightfall);

    expect(wrapper.find('canvas').exists()).toBe(false);
    expect(ogl.destroy).toHaveBeenCalledOnce();

    wrapper.unmount();
  });
});
