/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'ice-blue': '#60A5FA',
        'ice-mint': '#34D399',
        'ice-pink': '#F472B6',
      },
    },
  },
  plugins: [],
};
