/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--color-bg)",
                primary: {
                    DEFAULT: "var(--color-primary)",
                    50: "var(--color-primary-50)",
                    100: "var(--color-primary-100)",
                    200: "var(--color-primary-200)",
                    300: "var(--color-primary-300)",
                    400: "var(--color-primary-400)",
                    500: "var(--color-primary-500)",
                    600: "var(--color-primary-600)",
                    700: "var(--color-primary-700)",
                    800: "var(--color-primary-800)",
                    900: "var(--color-primary-900)",
                },
                secondary: "var(--color-secondary)",
                accent: "var(--color-accent)",
                surface: {
                    DEFAULT: "var(--color-surface)",
                    hover: "var(--color-surface-hover)",
                    active: "var(--color-surface-active)",
                },
            },
            borderColor: {
                themed: "var(--color-border)",
                "themed-hover": "var(--color-border-hover)",
            },
        },
    },
    plugins: [],
}
