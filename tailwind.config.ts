import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        blaze: {
          orange: '#E8590C',
          dark: '#0A0A0A',
        },
      },
    },
  },
  plugins: [],
};

export default config;
