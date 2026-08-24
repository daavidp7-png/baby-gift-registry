"use client";

import { useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "baby-registry-favorites";
const EMPTY_SNAPSHOT = "[]";
const listeners = new Set<() => void>();

function getSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_SNAPSHOT;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function parseFavoriteIds(snapshot: string) {
  try {
    const value = JSON.parse(snapshot);
    return new Set(
      Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string")
        : []
    );
  } catch {
    return new Set<string>();
  }
}

export function useFavorites() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_SNAPSHOT
  );
  const favoriteIds = useMemo(() => parseFavoriteIds(snapshot), [snapshot]);

  const toggleFavorite = (giftId: string) => {
    const next = parseFavoriteIds(getSnapshot());

    if (next.has(giftId)) {
      next.delete(giftId);
    } else {
      next.add(giftId);
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    listeners.forEach((listener) => listener());
  };

  return { favoriteIds, toggleFavorite };
}
