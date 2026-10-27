// The floating mini window: an always-on-top Document Picture-in-Picture window where the
// browser supports it (Chrome, Edge), otherwise a small popup window. React renders into it
// through a portal, so it shares the app's store and updates live.
import { useSyncExternalStore } from 'react';

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}
declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

export const FLOATING_ROOT_ID = 'floating-root';
const SIZE = { width: 300, height: 440 };

let current: Window | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The open mini window, or null. */
export function useFloatingWindow(): Window | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** The open mini window, or null (non-React callers). */
export const floatingWindow = () => current;

/** Copy the app's stylesheets (and theme) into the new window so components look the same. */
function prepare(win: Window) {
  const doc = win.document;
  doc.title = 'Calendar · mini';
  doc.head.querySelectorAll('[data-floating-copy]').forEach((n) => n.remove());
  doc.body.replaceChildren();
  for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.setAttribute('data-floating-copy', '');
    doc.head.appendChild(copy);
  }
  const meta = doc.createElement('meta');
  meta.name = 'color-scheme';
  meta.content = 'light dark';
  meta.setAttribute('data-floating-copy', '');
  doc.head.appendChild(meta);
  doc.documentElement.lang = document.documentElement.lang;
  syncTheme(win);
  doc.body.className = 'floating-body';
  const root = doc.createElement('div');
  root.id = FLOATING_ROOT_ID;
  doc.body.appendChild(root);
}

/** Mirror the main page's data-theme attribute (light / dark override). */
export function syncTheme(win: Window) {
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme) win.document.documentElement.setAttribute('data-theme', theme);
  else win.document.documentElement.removeAttribute('data-theme');
}

/** Some embedded browsers close Picture-in-Picture windows immediately; then use popups. */
let pipBroken = false;

function openPopup(): Window | null {
  const left = Math.max(0, window.screenX + window.outerWidth - SIZE.width - 24);
  return window.open('', 'calendar-mini', `popup,width=${SIZE.width},height=${SIZE.height},left=${left},top=${window.screenY + 80}`);
}

function adopt(win: Window, pip: boolean) {
  prepare(win);
  const openedAt = Date.now();
  win.addEventListener('pagehide', () => {
    if (current !== win) return;
    current = null;
    emit();
    if (pip && Date.now() - openedAt < 1000) {
      pipBroken = true;
      const popup = openPopup();
      if (popup) adopt(popup, false);
    }
  });
  current = win;
  emit();
}

/** Open (or focus) the mini window. Must run from a click. Resolves false if the browser blocked it. */
export async function openFloating(): Promise<boolean> {
  if (current && !current.closed) {
    current.focus();
    return true;
  }
  if (window.documentPictureInPicture && !pipBroken) {
    try {
      adopt(await window.documentPictureInPicture.requestWindow(SIZE), true);
      return true;
    } catch {
      // Fall through to a popup.
    }
  }
  const popup = openPopup();
  if (!popup) return false;
  adopt(popup, false);
  return true;
}

export function closeFloating() {
  const win = current;
  current = null;
  emit();
  win?.close();
}

// A popup (unlike Picture-in-Picture) would outlive the page; close it with the app.
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => current?.close());

// Dev-only handle for browser automation checks.
if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __floatingWindow: () => current });
