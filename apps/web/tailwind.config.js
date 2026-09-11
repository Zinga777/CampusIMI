/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        campus: {
          50: "#f4f6fb",
          100: "#e7ecf7",
          200: "#c9d5ec",
          300: "#a1b4dc",
          400: "#7089c6",
          500: "#4d68ab",
          600: "#3a4f8a",
          700: "#303f6f",
          800: "#2a375c",
          900: "#26304e",
        },
        accent: {
          400: "#f7b955",
          500: "#f2a53c",
          600: "#dc8c22",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
