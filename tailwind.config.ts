import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta acolhedora: verde suave, verde-azulado, bege, cinza quente.
        sage: {
          50: "#f2f7f4",
          100: "#e0ede6",
          200: "#c2dbcd",
          300: "#98c1ac",
          400: "#6ba286",
          500: "#4c8568",
          600: "#3a6a52",
          700: "#305544",
          800: "#294538",
          900: "#233a30",
        },
        teal: {
          50: "#eff8f8",
          100: "#d7edee",
          200: "#b3dcde",
          300: "#82c3c7",
          400: "#4fa3a9",
          500: "#35878e",
          600: "#2d6d74",
          700: "#295860",
          800: "#264a50",
          900: "#233f45",
        },
        sand: {
          50: "#faf8f3",
          100: "#f3efe4",
          200: "#e7dfca",
          300: "#d8caa6",
          400: "#c6b07f",
        },
        warmgray: {
          50: "#f7f6f5",
          100: "#eeecea",
          200: "#ddd9d5",
          300: "#c2bcb5",
          400: "#9e968d",
          500: "#7f766c",
          600: "#665e56",
          700: "#544d47",
          800: "#47413c",
          900: "#3d3833",
        },
        // Estados sem julgamento
        done: "#4c8568",     // realizei - verde suave
        partial: "#d8ac4f",  // parcial - amarelo suave
        undone: "#a99f93",   // não realizei - cinza quente (nunca vermelho intenso)
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        soft: "0 2px 12px rgba(45, 60, 55, 0.06)",
        card: "0 4px 20px rgba(45, 60, 55, 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
