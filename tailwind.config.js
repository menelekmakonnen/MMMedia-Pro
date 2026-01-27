/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#050510",
                primary: "#8b5cf6", // Violet-500
                secondary: "#06b6d4", // Cyan-500
            }
        },
    },
    plugins: [],
}
