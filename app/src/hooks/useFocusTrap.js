import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Trap keyboard focus inside a modal for as long as it is open.
 *
 * Without this, Tab walks straight out of the dialog and into the page
 * behind it — the content is visually covered by the overlay but still
 * reachable, which leaves keyboard and screen-reader users lost.
 *
 * Also wires Escape-to-close and restores focus to the element that opened
 * the dialog on unmount.
 *
 * @param {boolean} active Whether the trap is engaged.
 * @param {() => void} [onEscape] Called when Escape is pressed.
 * @returns {React.RefObject<HTMLElement>} Attach to the dialog container.
 */
export function useFocusTrap(active, onEscape) {
  const containerRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return undefined;

    const container = containerRef.current;
    previouslyFocusedRef.current = document.activeElement;

    // Move focus into the dialog so the next Tab starts inside it.
    const focusable = getFocusable(container);
    const initial = focusable[0] || container;
    if (initial) {
      // A container without a tabindex cannot receive focus programmatically.
      if (initial === container && !container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
      }
      initial.focus({ preventScroll: true });
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onEscapeRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = getFocusable(container);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      // Wrap around at both ends, and pull focus back in if it has escaped
      // the container entirely (for example after a click outside).
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !container.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const toRestore = previouslyFocusedRef.current;
      if (toRestore && typeof toRestore.focus === 'function') {
        toRestore.focus({ preventScroll: true });
      }
    };
  }, [active]);

  return containerRef;
}

export default useFocusTrap;
