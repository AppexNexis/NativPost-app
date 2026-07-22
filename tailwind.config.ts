/* eslint-disable ts/no-require-imports */
import type { Config } from 'tailwindcss';

const config = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /**
       * NativPost type scale — tracking tightens as size grows (large text
       * needs negative letter-spacing to feel engineered; small text needs
       * a touch of positive tracking to stay legible). Line-heights are
       * fixed rem values so rows align to the spacing grid.
       * Use these semantic sizes for new UI instead of raw text-{n}.
       */
      fontFamily: {
        display: 'var(--font-safiro)',
        mono: 'var(--font-geist-mono)',
      },
      fontSize: {
        display: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.022em', fontWeight: '600' }],
        title: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.017em', fontWeight: '600' }],
        heading: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.011em', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.375rem', letterSpacing: '-0.006em' }],
        ui: ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '-0.004em' }],
        meta: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0' }],
        micro: ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.005em' }],
        label: ['0.625rem', { lineHeight: '0.75rem', letterSpacing: '0.08em', fontWeight: '600' }],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      transitionDuration: {
        instant: 'var(--motion-instant)',
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        'out-quart': 'var(--ease-out-quart)',
        'in-out-quart': 'var(--ease-in-out-quart)',
      },
      boxShadow: {
        'elevation-1': 'var(--elevation-1)',
        'elevation-2': 'var(--elevation-2)',
        'elevation-3': 'var(--elevation-3)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;

export default config;
