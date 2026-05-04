import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0fdf4', 500: '#22c55e', 700: '#15803d', 900: '#14532d' },
        danger: '#ef4444',
        warn: '#f59e0b',
      },
      fontFamily: { sans: ['IBM Plex Sans', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config
