/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        redis: {
          hyper: '#FF4438',
          red: '#DC382C',
          midnight: '#091A23',
          dusk: '#163341',
          slate: '#1E2D3A',
          mist: '#2A3D4D',
          yellow: '#FFE9A6',
          lavender: '#C795E3',
          mint: '#80DBC4',
          warm: '#FBF7F1',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,68,56,0.35), 0 8px 24px -8px rgba(255,68,56,0.45)',
      },
    },
  },
  plugins: [],
};
