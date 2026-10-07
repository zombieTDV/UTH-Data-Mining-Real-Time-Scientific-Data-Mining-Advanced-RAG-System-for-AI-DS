import { colors } from './colors';
import { spacing, radius } from './spacing';
import { fontFamily, fontSize, fontWeight } from './typography';

export const tw = {
  colors,
  spacing,
  radius,
  font: {
    family: fontFamily,
    size: fontSize,
    weight: fontWeight,
  },
} as const;

export type TwToken = typeof tw;
