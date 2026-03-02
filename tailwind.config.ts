import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0a0a0a',
          card: '#141414',
          panel: '#1a1a1a',
          border: '#2a2a2a',
          'border-hover': '#3a3a3a',
        },
        accent: {
          DEFAULT: '#f3ff97',
          hover: '#e5f080',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
