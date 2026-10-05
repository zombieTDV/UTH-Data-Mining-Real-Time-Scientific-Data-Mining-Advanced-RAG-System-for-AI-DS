export const colors = {
  bronze: '#f59e0b',
  silver: '#60a5fa',
  gold: '#fbbf24',
  emerald: '#10b981',
  violet: '#c084fc',
  orange: '#ff5722',
  blue: '#3b82f6',
  red: '#ef4444',
  white: '#ffffff',
  black: '#04060a',
} as const;

export type AccentColor = keyof typeof colors;
