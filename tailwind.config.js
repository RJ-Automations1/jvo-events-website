/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["'Playfair Display'", "serif"],
        sans: ["'Lato'", "sans-serif"],
      },
      colors: {
        ink: "#080808",
      },
    },
  },
  plugins: [],
};
