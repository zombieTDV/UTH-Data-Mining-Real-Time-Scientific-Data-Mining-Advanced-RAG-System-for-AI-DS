import { useSyncExternalStore } from 'react';
import type { AppTheme } from '../types';

const STORAGE_KEY = 'uth-theme';

const getInitialTheme = (): AppTheme => {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(STORAGE_KEY) as AppTheme;
  if (saved === 'dark' || saved === 'light') return saved;
  return 'dark';
};

let currentTheme: AppTheme = getInitialTheme();

if (typeof window !== 'undefined') {
  document.documentElement.setAttribute('data-theme', currentTheme);
}

const listeners = new Set<() => void>();

function emitThemeChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function setTheme(theme: AppTheme) {
  if (currentTheme === theme) return;
  currentTheme = theme;
  if (typeof window !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }
  emitThemeChange();
}

export function toggleTheme() {
  const next = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): AppTheme {
  return currentTheme;
}

export function useThemeStore() {
  const theme: AppTheme = useSyncExternalStore(subscribe, getSnapshot, () => 'dark' as AppTheme);
  return {
    theme,
    setTheme,
    toggleTheme,
  };
}
