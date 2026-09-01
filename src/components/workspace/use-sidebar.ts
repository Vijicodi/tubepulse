"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "tubepulse:sidebar-collapsed";

/**
 * Whether the desktop sidebar is collapsed, remembered across visits.
 *
 * WHY useSyncExternalStore RATHER THAN AN EFFECT. localStorage is state that
 * lives outside React, and the server cannot see it. This hook is the API
 * built for exactly that: it renders the server snapshot (expanded) during
 * hydration and swaps to the real stored value without a setState-in-effect,
 * which both React and the lint rule rightly object to.
 *
 * It also means a change in ANOTHER TAB is picked up, via the `storage` event
 * — collapse the sidebar in one tab and the others follow rather than silently
 * disagreeing with what is on screen.
 *
 * Every storage access is wrapped: Safari in private mode throws on read, and
 * a browser set to block site data throws on write. Neither should be able to
 * take down the workspace shell over a cosmetic preference.
 */

/**
 * The cached snapshot.
 *
 * useSyncExternalStore compares snapshots by identity and will loop forever if
 * getSnapshot returns a fresh value each call, so the boolean is cached here
 * and only recomputed when something actually changes it — a local toggle, or
 * a `storage` event from another tab.
 */
let snapshot: boolean | null = null;
const listeners = new Set<() => void>();

function emit() {
  snapshot = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab wrote the key: drop the cache before telling React, or it
  // would re-read the stale snapshot and ignore the change.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      snapshot = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): boolean {
  if (snapshot === null) snapshot = readCollapsed();
  return snapshot;
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    // Server snapshot: always expanded, because there is no storage to read.
    () => false,
  );

  const toggle = useCallback(() => {
    const next = !readCollapsed();
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Preference is not persisted; the session still works.
    }
    emit();
  }, []);

  // Ctrl/Cmd + B, the convention every editor and every IDE already uses.
  // Ignored while typing, so a search box cannot be hijacked mid-word.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "b" && event.key !== "B") return;
      if (!event.metaKey && !event.ctrlKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      toggle();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return { collapsed, toggle };
}
