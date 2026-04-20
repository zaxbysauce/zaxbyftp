/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#1a1a2e',
          800: '#16213e',
          700: '#0f3460',
          600: '#1e2a4a',
        },
      },
    },
  },
  plugins: [],
}
