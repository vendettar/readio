/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
      /* Layout tokens from src/index.css */
      spacing: {
        sidebar: 'var(--sidebar-width)',
        'mini-player': 'var(--mini-player-height)',
        'player-footer': 'var(--player-footer-height)',
        'page-gutter': 'var(--page-gutter-x)',
        'page-margin': 'var(--page-margin-x)',
        48: '48%',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      inset: {
        '1/2': '50%',
        48: '48%',
      },
      width: {
        panel: '25rem',
        'panel-sm': '20rem',
        sidebar: 'var(--sidebar-width)',
        'search-palette': 'calc(var(--sidebar-width) * 1.5)',
      },
      height: {
        'mini-player': 'var(--mini-player-height)',
      },
      maxHeight: {
        'search-results': '60vh',
      },
      maxWidth: {
        content: '105rem',
        'content-wide': '112.5rem',
        'search-palette': 'min(calc(var(--sidebar-width) * 1.5), calc(100vw - 2rem))',
      },
      padding: {
        page: 'var(--page-margin-x)',
        gutter: 'var(--page-gutter-x)',
      },
      margin: {
        page: 'var(--page-margin-x)',
        gutter: 'var(--page-gutter-x)',
      },
      fontSize: {
        xxs: ['0.625rem', { lineHeight: '0.875rem' }], // 10px font, 14px line-height
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'hsl(var(--foreground) / 0.9)',
            '--tw-prose-headings': 'hsl(var(--foreground))',
            '--tw-prose-links': 'hsl(var(--primary))',
            '--tw-prose-bold': 'hsl(var(--foreground))',
            '--tw-prose-bullets': 'hsl(var(--muted-foreground))',
            '--tw-prose-counters': 'hsl(var(--muted-foreground))',
            fontSize: '0.875rem',
            lineHeight: '1.4',
            fontWeight: '300',
            p: { marginTop: '0', marginBottom: '10px' },
            'ul, ol': { marginTop: '0', marginBottom: '10px', paddingLeft: '1.25em' },
            li: { marginTop: '0', marginBottom: '4px' },
            a: {
              fontWeight: '600',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              // No hover color/opacity change - complies with text hover rule (underline only)
            },
            'b, strong': { fontWeight: '700' },
          },
        },
      },
      zIndex: {
        sidebar: 'var(--z-sidebar)',
        'mini-player': 'var(--z-mini-player)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
}
