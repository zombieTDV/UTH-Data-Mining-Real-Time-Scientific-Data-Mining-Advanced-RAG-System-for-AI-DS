export const fontFamily = {
  sans: "'Geist', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif",
  mono: "'Geist Mono', 'JetBrains Mono', 'SF Mono', monospace",
  math: "'STIX Two Math', 'Cambria Math', 'Latin Modern Math', 'TeX Gyre Termes Math', Georgia, serif",
} as const;

export const fontSize = {
  micro: '10px',
  caption: '11px',
  body: '12px',
  title: '13px',
  subtitle: '15px',
  display: '22px',
  hero: '32px',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export type FontFamilyToken = keyof typeof fontFamily;
export type FontSizeToken = keyof typeof fontSize;
export type FontWeightToken = keyof typeof fontWeight;
