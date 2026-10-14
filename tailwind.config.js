/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { ink: '#10131b', panel: '#171b26', accent: '#8b9cff', mint: '#92e3c1' } } },
  plugins: [],
};
