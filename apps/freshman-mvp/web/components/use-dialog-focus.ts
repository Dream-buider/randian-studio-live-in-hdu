import {
  nextTick,
  onMounted,
  onUnmounted,
  type Ref,
} from 'vue';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogFocus(
  panel: Ref<HTMLElement | null>,
  initialSelector: string,
  close: () => void,
): void {
  let opener: HTMLElement | null = null;

  function focusableElements(): HTMLElement[] {
    if (!panel.value) {
      return [];
    }
    return [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      .filter((element) => element.getAttribute('aria-hidden') !== 'true');
  }

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const elements = focusableElements();
    if (elements.length === 0) {
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.value?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !panel.value?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  onMounted(async () => {
    opener = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.addEventListener('keydown', onDocumentKeydown);
    await nextTick();
    const initial = panel.value?.querySelector<HTMLElement>(initialSelector);
    (initial ?? focusableElements()[0])?.focus();
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', onDocumentKeydown);
    if (opener?.isConnected) {
      opener.focus();
    }
  });
}
