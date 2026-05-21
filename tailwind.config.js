/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e8ecf5',
          100: '#c5cfe8',
          200: '#9eb0d9',
          300: '#7490ca',
          400: '#4f73be',
          500: '#2b57b2',
          600: '#1a3f94',
          700: '#112e78',
          800: '#081f5c',
          900: '#040f2e',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
