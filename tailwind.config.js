/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAF7F2",
        ink: "#1F2937",
        sage: {
          DEFAULT: "#7BA098",
          50: "#EEF4F2",
          100: "#DDE9E5",
          200: "#BBD3CC",
          300: "#99BDB2",
          400: "#7BA098",
          500: "#5C8479",
          600: "#446A60",
        },
        coral: {
          DEFAULT: "#E8927C",
          soft: "#F5C5B8",
        },
        muted: "#6B7280",
        line: "#E6E1D8",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        dyslexic: ['"OpenDyslexic"', "Comic Sans MS", "Verdana", "sans-serif"],
      },
      borderRadius: {
        tile: "1.25rem",
      },
      boxShadow: {
        tile: "0 1px 2px rgba(31,41,55,0.04), 0 4px 12px rgba(31,41,55,0.06)",
        card: "0 1px 2px rgba(31,41,55,0.04), 0 8px 24px rgba(31,41,55,0.06)",
      },
      keyframes: {
        fadeInOut: {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "20%": { opacity: "1", transform: "scale(1)" },
          "80%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(1)" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.85" },
          "50%": { transform: "scale(1.35)", opacity: "1" },
        },
        softIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeInOut: "fadeInOut 2s ease-in-out forwards",
        breathe: "breathe 4s ease-in-out infinite",
        softIn: "softIn 200ms ease-out forwards",
      },
    },
  },
  plugins: [],
};
