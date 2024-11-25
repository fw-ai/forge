// tailwind.config.js
module.exports = {
  darkMode: false, // Disable dark mode

  content: [
    './app/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6', // Example: Blue
        secondary: '#fbbf24', // Example: Yellow
      },
    },
  },
  plugins: [],
};
