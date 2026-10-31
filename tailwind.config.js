/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: '#00d2ff', // Your neon blue
        dark: '#0f0c29',  // Your background dark
      }
    },
  },
  plugins: [],
}