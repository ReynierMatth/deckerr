import { useEffect, useRef } from 'react';

/**
 * Make the browser Back button / mobile back gesture close a transient UI layer
 * (drawer, modal, detail panel, in-component sub-view) instead of navigating
 * away from the page.
 *
 * How it works: when a layer opens we push a throwaway history entry and add it
 * to a shared LIFO stack. A single global `popstate` handler closes the TOP
 * layer only (so nested layers pop one at a time). Closing a layer
 * programmatically (tap ✕ / backdrop) removes it from the stack and consumes
 * the entry we pushed, so history stays balanced. A router navigation that
 * unmounts an open layer is detected (our marker is no longer the current
 * entry) and we skip the rewind so navigation isn't undone.
 *
 * Usage: `useBackDismiss(isOpen, onClose)` inside any component that owns an
 * open/close boolean. The shared Modal already calls it, so every Modal-based
 * drawer gets this for free; ad-hoc overlays and sub-views opt in directly.
 */

interface Layer {
  close: () => void;
}

const stack: Layer[] = [];
let popBound = false;
// Set when WE trigger history.back() on a programmatic close, so the resulting
// popstate doesn't also try to close a layer.
let selfPop = false;

function ensurePopHandler(): void {
  if (popBound) return;
  popBound = true;
  window.addEventListener('popstate', () => {
    if (selfPop) {
      selfPop = false;
      return;
    }
    const top = stack.pop();
    if (top) top.close();
  });
}

export function useBackDismiss(isOpen: boolean, onClose: () => void): void {
  // Keep the latest onClose without re-running the effect (which would push a
  // new history entry on every render).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    ensurePopHandler();

    const layer: Layer = { close: () => closeRef.current() };
    stack.push(layer);
    window.history.pushState({ __backLayer: true }, '');

    return () => {
      const idx = stack.lastIndexOf(layer);
      // Closed via Back: the popstate handler already popped us — nothing to do.
      if (idx === -1) return;
      stack.splice(idx, 1);
      // Programmatic close: consume the entry we pushed, unless a route
      // navigation has already replaced it (then rewinding would undo the nav).
      //
      // The rewind is DEFERRED to the next macrotask: when a close and a router
      // navigation happen in the same handler (e.g. "choose a game" closes the
      // modal AND navigates to /deck), TanStack's navigate() pushes its history
      // entry asynchronously. Rewinding synchronously here would run first and
      // cancel that navigation (URL snaps back — the bug seen in the Android
      // WebView). Deferring lets the async navigation commit; we then re-check
      // and only rewind if our marker is still the current entry (i.e. it was a
      // genuine close with no navigation).
      if (window.history.state?.__backLayer) {
        setTimeout(() => {
          if (window.history.state?.__backLayer) {
            selfPop = true;
            window.history.back();
          }
        }, 0);
      }
    };
  }, [isOpen]);
}
