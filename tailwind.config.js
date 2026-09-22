/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral ramp: deliberately cool-dark rather than pure black so that
        // level artwork sits on the page instead of floating on a void.
        ink: {
          950: '#0a0b0e',
          900: '#0f1116',
          850: '#13161d',
          800: '#181c25',
          750: '#1e232e',
          700: '#262c39',
          600: '#333a4a',
          500: '#4a5265',
          400: '#6b7488',
          300: '#98a0b3',
          200: '#c3c9d6',
          100: '#e6e9ef',
        },
        brand: {
          50: '#fff5ed',
          100: '#ffe8d4',
          200: '#ffcda8',
          300: '#ffaa70',
          400: '#ff7c36',
          500: '#ff5c0a',
          600: '#f04300',
          700: '#c73302',
          800: '#9e2a0b',
          900: '#7f260c',
        },
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Chakra Petch', 'Inter var', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.7)',
        'card-hover': '0 1px 2px rgba(0,0,0,.4), 0 18px 40px -16px rgba(0,0,0,.8)',
        glow: '0 0 0 1px rgba(255,92,10,.35), 0 8px 32px -8px rgba(255,92,10,.25)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(10px) scale(.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out both',
        'fade-up': 'fade-up .22s cubic-bezier(.22,1,.36,1) both',
        'scale-in': 'scale-in .16s cubic-bezier(.22,1,.36,1) both',
        'toast-in': 'toast-in .2s cubic-bezier(.22,1,.36,1) both',
      },
    },
  },
  plugins: [],
}
