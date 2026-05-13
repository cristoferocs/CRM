import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // Design system base surfaces
        void: "#06060a",
        deep: "#0c0c12",
        surface: {
          DEFAULT: "#111119",
          2: "#17171f",
          3: "#1e1e28",
        },
        rim: "rgba(255,255,255,0.06)",
        rim2: "rgba(255,255,255,0.10)",

        // Accent palette
        cyan: {
          DEFAULT: "#00d4ff",
          dim: "rgba(0,212,255,0.12)",
          glow: "rgba(0,212,255,0.25)",
        },
        violet: {
          DEFAULT: "#7c5cfc",
          dim: "rgba(124,92,252,0.12)",
        },
        jade: {
          DEFAULT: "#00e5a0",
          dim: "rgba(0,229,160,0.10)",
        },
        rose: {
          DEFAULT: "#ff4d6d",
          dim: "rgba(255,77,109,0.10)",
        },
        amber: {
          DEFAULT: "#ffb547",
          dim: "rgba(255,181,71,0.10)",
        },

        // Text scale
        t1: "#f0f0f8",
        t2: "#9898b0",
        t3: "#55556a",
        t4: "#33333f",

        // shadcn/ui CSS-var tokens (used by UI components)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "DM Sans", "sans-serif"],
        display: ["var(--font-display)", "Inter", "sans-serif"],
        mono: ["var(--font-mono)", "'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        "ring-pulse": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(0,229,160,0.4)" },
          "50%": { boxShadow: "0 0 16px rgba(0,229,160,0.7)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease both",
        blink: "blink 1.5s ease-in-out infinite",
        "ring-pulse": "ring-pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;