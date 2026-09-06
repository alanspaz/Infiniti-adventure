export const theme = {
  colors: {
    background: '#140f0c',
    accent: '#d4a054',
    text: '#f2e8d5',
    textMuted: '#a89880',
    surface: '#1e1814',
    border: '#3a2f26',
    danger: '#c45c4a',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
} as const;

export type Theme = typeof theme;
