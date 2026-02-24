/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: '#ffffff',
          surface: '#fafafa',
          border: '#e5e7eb',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
